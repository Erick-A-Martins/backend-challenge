import { Injectable, Logger } from "@nestjs/common";
import { OutboxRepository } from "../../outbox/domain/outbox.repository";
import type { OutboxMessage } from "../../outbox/domain/outbox-message";
import { Clock } from "../../shared/application/clock";
import { describeError } from "../../shared/application/describe-error";
import { IdGenerator } from "../../shared/application/id-generator";
import { MessagingConfig } from "../messaging.config";
import { SqsGateway } from "./sqs.gateway";

export interface PublishRoundResult {
    claimed: number;
    published: number;
    failed: number;
    leaseLost: number;
}

@Injectable()
export class OutboxPublisher {
    private readonly logger = new Logger(OutboxPublisher.name);

    constructor(
        private readonly outbox: OutboxRepository,
        private readonly gateway: SqsGateway,
        private readonly config: MessagingConfig,
        private readonly clock: Clock,
        private readonly ids: IdGenerator,
    ) {}
    
    async publishPending(): Promise<PublishRoundResult> {
        const { publisherBatchSize, publisherLeaseSeconds } = this.config.settings;
        const now = this.clock.now();

        const claimed = await this.outbox.claimDue({
            now,
            limit: publisherBatchSize,
            leaseUntil: new Date(now.getTime() + publisherLeaseSeconds * 1_000),
            leaseToken: this.ids.next(),
        });

        const result: PublishRoundResult = { claimed: claimed.length, published: 0, failed: 0, leaseLost: 0 };

        for (const message of claimed) {
            try {
                await this.send(message);
            } catch (error) {
                await this.registerFailure(message, error);
                result.failed += 1;
                continue;
            }
            
            message.markPublished(this.clock.now());
            if (await this.outbox.markPublished(message)) {
                result.published += 1;
            } else {
                result.leaseLost += 1;
                this.logger.warn(`Lease lost before confirming outbox message ${message.id}`);
            }
        }

        return result;
    }

    private send(message: OutboxMessage): Promise<void> {
        return this.gateway.send(this.config.settings.eventsQueueUrl, {
            body: JSON.stringify(message.payload),
            groupId: message.aggregateId,
            deduplicationId: message.id,
        });
    }

    private async registerFailure(message: OutboxMessage, error: unknown): Promise<void> {
        message.scheduleRetry(this.clock.now(), describeError(error));
        await this.outbox.release(message);
        this.logger.warn(
            `Failed to publish outbox message ${message.id} (attempt ${message.attempts}): ${describeError(error)}`,
        );
    }
}
