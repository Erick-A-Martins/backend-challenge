export class InboxPayloadConflictError extends Error {
    constructor(
        public readonly consumerName: string,
        public readonly messageId: string,
    ) {
        super(`Inbox message ${consumerName}/${messageId} was received with a different payload`);
        this.name = "InboxPayloadConflictError";
    }
}
