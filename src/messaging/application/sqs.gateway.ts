export interface OutgoingMessage {
    body: string;
    groupId: string;
    deduplicationId: string;
    attributes?: Readonly<Record<string, string>>;
}

export interface ReceivedMessage {
    messageId: string;
    receiptHandle: string;
    body: string;
    receiveCount: number;
    groupId?: string;
}

export interface ReceiveOptions {
    maxMessages: number;
    waitSeconds: number;
}

export abstract class SqsGateway {
    abstract send(queueUrl: string, message: OutgoingMessage): Promise<void>;
    abstract receive(queueUrl: string, options: ReceiveOptions): Promise<ReceivedMessage[]>;
    abstract delete(queueUrl: string, receiptHandle: string): Promise<void>;
    abstract changeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<void>;
    abstract checkQueue(queueUrl: string): Promise<void>;
}
