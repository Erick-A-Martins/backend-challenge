export interface MessagingSettings {
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    requestQueueUrl: string;
    deadLetterQueueUrl: string;
    eventsQueueUrl: string;
    consumerName: string;
    workersEnabled: boolean;
    publisherBatchSize: number;
    publisherLeaseSeconds: number;
    publisherPollMs: number;
    consumerBatchSize: number;
    consumerWaitSeconds: number;
    retryBaseSeconds: number;
    retryMaxSeconds: number;
    referenceRetryBatchSize: number;
    referenceRetryPollMs: number;
}

type Env = Record<string, string | undefined>;

const numberFrom = (value: string | undefined, fallback: number): number =>
    value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback;

const LOCAL_QUEUES = "http://localhost:4566/000000000000";

export class MessagingConfig {
    constructor(public readonly settings: MessagingSettings) {}

    static fromEnv(env: Env = process.env): MessagingConfig {
        const endpoint = env["AWS_ENDPOINT"];
        return new MessagingConfig({
            region: env["AWS_REGION"] ?? "us-east-1",
            ...(endpoint ? { endpoint } : {}),
            accessKeyId: env["AWS_ACCESS_KEY_ID"] ?? "test",
            secretAccessKey: env["AWS_SECRET_ACCESS_KEY"] ?? "test",
            requestQueueUrl: env["SQS_QUEUE_URL"] ?? `${LOCAL_QUEUES}/wager-transactions.fifo`,
            deadLetterQueueUrl: env["SQS_DLQ_URL"] ?? `${LOCAL_QUEUES}/wager-transactions-dlq.fifo`,
            eventsQueueUrl: env["SQS_EVENTS_QUEUE_URL"] ?? `${LOCAL_QUEUES}/wager-events.fifo`,
            consumerName: "wager-transactions-consumer",
            workersEnabled: (env["WORKERS_ENABLED"] ?? "true") !== "false",
            publisherBatchSize: numberFrom(env["OUTBOX_BATCH_SIZE"], 20),
            publisherLeaseSeconds: numberFrom(env["OUTBOX_LEASE_SECONDS"], 30),
            publisherPollMs: numberFrom(env["OUTBOX_POLL_MS"], 500),
            consumerBatchSize: 10,
            consumerWaitSeconds: numberFrom(env["CONSUMER_WAIT_SECONDS"], 5),
            retryBaseSeconds: 2,
            retryMaxSeconds: 60,
            referenceRetryBatchSize: numberFrom(env["REFERENCE_RETRY_BATCH_SIZE"], 25),
            referenceRetryPollMs: numberFrom(env["REFERENCE_RETRY_POLL_MS"], 1_000),
        });
    }

    withSettings(overrides: Partial<MessagingSettings>): MessagingConfig {
        return new MessagingConfig({ ...this.settings, ...overrides });
    }
}
