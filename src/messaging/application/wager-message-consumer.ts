// src/messaging/application/wager-message-consumer.ts
import { Injectable, Logger } from "@nestjs/common";
import { Clock } from "../../shared/application/clock";
import { describeError } from "../../shared/application/describe-error";
import { Hasher } from "../../shared/application/hasher";
import { UnitOfWork } from "../../shared/application/unit-of-work";
import { SubmitWagerTransactionUseCase } from "../../wagering/application/submit-wager-transaction.use-case";
import { InboxDuplicateError } from "../domain/errors/inbox-duplicate.error";
import { InboxPayloadMismatchError } from "../domain/errors/inbox-payload-mismatch.error";
import { InboxMessage } from "../domain/inbox-message";
import { InboxRepository } from "../domain/inbox.repository";
import { MessagingConfig } from "../messaging.config";
import { classifyError } from "./error-classifier";
import { retryDelaySeconds } from "./retry-delay";
import { SqsGateway, type ReceivedMessage } from "./sqs.gateway";
import { parseWagerRequestMessage, type WagerRequestMessage } from "./wager-request-message";

export type MessageOutcome =
    | "PROCESSED"
    | "DUPLICATE"
    | "ACKED_BUSINESS_ERROR"
    | "DEAD_LETTERED"
    | "RETRY_SCHEDULED"
    | "RELEASED";

@Injectable()
export class WagerMessageConsumer {
    private readonly logger = new Logger(WagerMessageConsumer.name);

    constructor(
        private readonly gateway: SqsGateway,
        private readonly unitOfWork: UnitOfWork,
        private readonly inbox: InboxRepository,
        private readonly submit: SubmitWagerTransactionUseCase,
        private readonly hasher: Hasher,
        private readonly clock: Clock,
        private readonly config: MessagingConfig,
    ) {}
    
    async pollOnce(isStopping: () => boolean = () => false): Promise<MessageOutcome[]> {
        const { requestQueueUrl, consumerBatchSize, consumerWaitSeconds } = this.config.settings;
        const messages = await this.gateway.receive(requestQueueUrl, {
            maxMessages: consumerBatchSize,
            waitSeconds: consumerWaitSeconds,
        });

        const outcomes: MessageOutcome[] = [];
        
        for (const message of messages) {
            outcomes.push(isStopping() ? await this.release(message) : await this.handle(message));
        }
        
        return outcomes;
    }

    async handle(message: ReceivedMessage): Promise<MessageOutcome> {
        let parsed: WagerRequestMessage;
        try {
            parsed = parseWagerRequestMessage(message.body, this.hasher);
        } catch (error) {
            return this.deadLetter(message, error);
        }

        try {
            const outcome = await this.unitOfWork.run(() => this.processInTransaction(parsed));
            await this.acknowledge(message);
            return outcome;
        } catch (error) {
            return this.handleFailure(message, error);
        }
    }
    
    private async processInTransaction(parsed: WagerRequestMessage): Promise<MessageOutcome> {
        const { consumerName } = this.config.settings;

        const existing = await this.inbox.find(consumerName, parsed.messageId);
        if (existing) {
            if (!existing.matchesPayload(parsed.payloadHash)) {
                throw new InboxPayloadMismatchError(parsed.messageId);
            }
            return "DUPLICATE";
        }

        const entry = InboxMessage.receive({
            messageId: parsed.messageId,
            consumerName,
            payloadHash: parsed.payloadHash,
            receivedAt: this.clock.now(),
        });
        await this.inbox.insert(entry);
        
        await this.submit.execute({ ...parsed.command, correlationId: parsed.messageId });

        entry.markProcessed(this.clock.now());
        await this.inbox.markProcessed(entry);
        return "PROCESSED";
    }

    private async handleFailure(message: ReceivedMessage, error: unknown): Promise<MessageOutcome> {
        if (error instanceof InboxDuplicateError) {
            await this.acknowledge(message);
            return "DUPLICATE";
        }

        switch (classifyError(error)) {
            case "business":
                this.logger.warn(`Message ${message.messageId} ended with a business error: ${describeError(error)}`);
                await this.acknowledge(message);
                return "ACKED_BUSINESS_ERROR";
            case "permanent":
                return this.deadLetter(message, error);
            default:
                return this.scheduleRetry(message, error);
        }
    }
    
    private async acknowledge(message: ReceivedMessage): Promise<void> {
        try {
            await this.gateway.delete(this.config.settings.requestQueueUrl, message.receiptHandle);
        } catch (error) {
            this.logger.warn(`Ack failed for message ${message.messageId}; it will be redelivered: ${describeError(error)}`);
        }
    }

    private async deadLetter(message: ReceivedMessage, error: unknown): Promise<MessageOutcome> {
        const { requestQueueUrl, deadLetterQueueUrl } = this.config.settings;
        const reason = describeError(error);
        try {
            await this.gateway.send(deadLetterQueueUrl, {
                body: message.body,
                groupId: message.groupId ?? "dead-letter",
                deduplicationId: message.messageId,
                attributes: { failureReason: reason.slice(0, 256), receiveCount: String(message.receiveCount) },
            });
            await this.gateway.delete(requestQueueUrl, message.receiptHandle);
            this.logger.error(`Message ${message.messageId} moved to the DLQ: ${reason}`);
            return "DEAD_LETTERED";
        } catch (sendError) {
            
            return this.scheduleRetry(message, sendError);
        }
    }

    private async scheduleRetry(message: ReceivedMessage, error: unknown): Promise<MessageOutcome> {
        const { requestQueueUrl, retryBaseSeconds, retryMaxSeconds } = this.config.settings;
        const delay = retryDelaySeconds(message.receiveCount, retryBaseSeconds, retryMaxSeconds);
        this.logger.warn(
            `Message ${message.messageId} failed (receive ${message.receiveCount}); retrying in ${delay}s: ${describeError(error)}`,
        );
        try {
            await this.gateway.changeVisibility(requestQueueUrl, message.receiptHandle, delay);
        } catch {
        }
        return "RETRY_SCHEDULED";
    }

    /** Shutdown: devolve a visibilidade para outra instância pegar a mensagem na hora. */
    private async release(message: ReceivedMessage): Promise<MessageOutcome> {
        try {
            await this.gateway.changeVisibility(this.config.settings.requestQueueUrl, message.receiptHandle, 0);
        } catch {
        }
        return "RELEASED";
    }
}
