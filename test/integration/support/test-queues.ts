import {
    CreateQueueCommand,
    DeleteMessageCommand,
    DeleteQueueCommand,
    GetQueueAttributesCommand,
    ReceiveMessageCommand,
    SQSClient,
} from "@aws-sdk/client-sqs";

export const createSqsClient = () =>
    new SQSClient({
        region: 'us-east-1',
        endpoint: process.env['AWS_ENDPOINT'] ?? 'http://localhost:4566',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        useQueueUrlAsEndpoint: false,
    });

export async function createFifoQueue(
    client: SQSClient,
    prefix: string,
    attributes: Record<string, string> = {},
): Promise<string> {
    const output = await client.send(
        new CreateQueueCommand({
            QueueName: `${prefix}-${Bun.randomUUIDv7()}.fifo`,
            Attributes: { FifoQueue: 'true', ...attributes },
        }),
    );
    if (!output.QueueUrl) {
        throw new Error('queue was not created');
    }
    return output.QueueUrl;
}

export interface QueuePair {
    queueUrl: string;
    dlqUrl: string;
}

export async function createQueueWithDlq(
    client: SQSClient,
    prefix: string,
    options: { maxReceiveCount: number; visibilityTimeoutSeconds: number },
): Promise<QueuePair> {
    const dlqUrl = await createFifoQueue(client, `${prefix}-dlq`);
    const attributes = await client.send(new GetQueueAttributesCommand({ QueueUrl: dlqUrl, AttributeNames: ['QueueArn'] }));
    const dlqArn = attributes.Attributes?.['QueueArn'];

    const queueUrl = await createFifoQueue(client, prefix, {
        VisibilityTimeout: String(options.visibilityTimeoutSeconds),
        RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: String(options.maxReceiveCount) }),
    });
    return { queueUrl, dlqUrl };
}

export interface DrainedMessage {
    body: string;
    groupId?: string;
    attributes: Record<string, string>;
}

export async function drainQueue(
    client: SQSClient,
    queueUrl: string,
    options: { expected: number; timeoutMs?: number },
): Promise<DrainedMessage[]> {
    const collected: DrainedMessage[] = [];
    const deadline = Date.now() + (options.timeoutMs ?? 8_000);

    while (collected.length < options.expected && Date.now() < deadline) {
        const output = await client.send(
            new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: 10,
                WaitTimeSeconds: 1,
                MessageSystemAttributeNames: ['MessageGroupId'],
                MessageAttributeNames: ['All'],
            }),
        );
        for (const message of output.Messages ?? []) {
            collected.push({
                body: message.Body ?? '',
                groupId: message.Attributes?.['MessageGroupId'],
                attributes: Object.fromEntries(
                    Object.entries(message.MessageAttributes ?? {}).map(([name, value]) => [name, value.StringValue ?? '']),
                ),
            });
            await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
        }
    }
    return collected;
}

export const deleteQueues = (client: SQSClient, urls: string[]) =>
    Promise.allSettled(urls.map((url) => client.send(new DeleteQueueCommand({ QueueUrl: url }))));
