import { DomainError } from "../../../shared/domain/errors/domain-error";

export class DuplicateTransactionError extends DomainError {
    constructor(providerId: string, externalTransactionId: string) {
        super(`Transaction ${providerId}/${externalTransactionId} conflicts with an existing transaction`);
    }
}
