import { DomainError } from "../../../shared/domain/errors/domain-error";

export class InboxMessageStateError extends DomainError {
    constructor(messageId: string) {
        super(`Inbox message ${messageId} was already processed`);
    }
}
