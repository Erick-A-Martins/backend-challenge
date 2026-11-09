import {
    SqsGateway,
    type OutgoingMessage,
    type ReceiveOptions,
    type ReceivedMessage,
} from "../../../src/messaging/application/sqs.gateway";

export class NullSqsGateway extends SqsGateway {
    override async send(_queueUrl: string, _message: OutgoingMessage): Promise<void> {}
    override async receive(): Promise<ReceivedMessage[]> {
        return [];
    }
    override async delete(): Promise<void> {}
    override async changeVisibility(): Promise<void> {}
    override async checkQueue(): Promise<void> {}
}

export class RecordingSqsGateway extends NullSqsGateway {
    readonly sent: OutgoingMessage[] = [];
    override async send(_queueUrl: string, message: OutgoingMessage): Promise<void> {
        this.sent.push(message);
    }
}

export class FailingSendGateway extends NullSqsGateway {
    override async send(_queueUrl: string, _message: OutgoingMessage): Promise<void> {
        throw new Error("sqs unavailable");
    }
}

export class FlakyDeleteGateway extends SqsGateway {
    constructor(
        private readonly inner: SqsGateway,
        private failures = 1,
    ) {
        super();
    }
    override send(queueUrl: string, message: OutgoingMessage): Promise<void> {
        return this.inner.send(queueUrl, message);
    }
    override receive(queueUrl: string, options: ReceiveOptions): Promise<ReceivedMessage[]> {
        return this.inner.receive(queueUrl, options);
    }
    override async delete(queueUrl: string, receiptHandle: string): Promise<void> {
        if (this.failures > 0) {
            this.failures -= 1;
            throw new Error("process died before the ack");
        }
        return this.inner.delete(queueUrl, receiptHandle);
    }
    override changeVisibility(queueUrl: string, receiptHandle: string, seconds: number): Promise<void> {
        return this.inner.changeVisibility(queueUrl, receiptHandle, seconds);
    }
    override checkQueue(queueUrl: string): Promise<void> {
        return this.inner.checkQueue(queueUrl);
    }
}
