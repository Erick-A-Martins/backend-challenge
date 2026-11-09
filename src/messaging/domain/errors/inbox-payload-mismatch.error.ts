import { DomainError } from "../../../shared/domain/errors/domain-error";

export class InboxPayloadMismatchError extends DomainError {
    constructor(messageId: string) {
        super(`Message ${messageId} was already received with a different payload`);
    }
}
