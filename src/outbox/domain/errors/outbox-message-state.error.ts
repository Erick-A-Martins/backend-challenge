import { DomainError } from "../../../shared/domain/errors/domain-error";

export class OutboxMessageStateError extends DomainError {
    constructor(operation: string, messageId: string) {
        super(`Cannot ${operation} outbox message ${messageId}: it was already published`);
    }
}
