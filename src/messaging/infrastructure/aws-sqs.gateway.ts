import {
    ChangeMessageVisibilityCommand,
    DeleteMessageCommand,
    GetQueueAttributesCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";
import { Injectable } from "@nestjs/common";
import {
    SqsGateway,
    type OutgoingMessage,
    type ReceiveOptions,
    type ReceivedMessage,
} from "../application/sqs.gateway";
import { MessagingConfig } from "../messaging.config";

@Injectable()
export class AwsSqsGateway extends SqsGateway {
    private readonly client: SQSClient;

    constructor(config: MessagingConfig) {
        super();
        const { region, endpoint, accessKeyId, secretAccessKey } = config.settings;
        this.client = new SQSClient({
            region,
            ...(endpoint ? { endpoint } : {}),
            credentials: { accessKeyId, secretAccessKey },
            useQueueUrlAsEndpoint: false,
        });
    }

    override async send(queueUrl: string, message: OutgoingMessage): Promise<void> {
        await this.client.send(
            new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: message.body,
                MessageGroupId: message.groupId,
                MessageDeduplicationId: message.deduplicationId,
                ...(message.attributes
                    ? {
                        MessageAttributes: Object.fromEntries(
                            Object.entries(message.attributes).map(([name, value]) => [
                                name,
                                { DataType: "String", StringValue: value },
                            ]),
                        ),
                    }
                    : {}),
            }),
        );
    }

    override async receive(queueUrl: string, options: ReceiveOptions): Promise<ReceivedMessage[]> {
        const output = await this.client.send(
            new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: options.maxMessages,
                WaitTimeSeconds: options.waitSeconds,
                MessageSystemAttributeNames: ["ApproximateReceiveCount", "MessageGroupId"],
            }),
        );

        return (output.Messages ?? []).flatMap((message) => {
            if (!message.MessageId || !message.ReceiptHandle || message.Body === undefined) {
                return [];
            }
            const groupId = message.Attributes?.["MessageGroupId"];
            return [
                {
                    messageId: message.MessageId,
                    receiptHandle: message.ReceiptHandle,
                    body: message.Body,
                    receiveCount: Number(message.Attributes?.["ApproximateReceiveCount"] ?? 1),
                    ...(groupId ? { groupId } : {}),
                },
            ];
        });
    }

    override async delete(queueUrl: string, receiptHandle: string): Promise<void> {
        await this.client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
    }

    override async changeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<void> {
        await this.client.send(
            new ChangeMessageVisibilityCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: receiptHandle,
                VisibilityTimeout: seconds,
            }),
        );
    }

    override async checkQueue(queueUrl: string): Promise<void> {
        await this.client.send(
            new GetQueueAttributesCommand({
                QueueUrl: queueUrl,
                AttributeNames: ["QueueArn"],
            }),
        );
    }
}
