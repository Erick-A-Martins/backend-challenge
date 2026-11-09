import { DomainError } from "../../../shared/domain/errors/domain-error";

export class InboxDuplicateError extends DomainError {
    constructor(consumerName: string, messageId: string) {
        super(`Message ${consumerName}/${messageId} was already received`);
    }
}
