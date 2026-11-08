import { DomainError } from "../../../shared/domain/errors/domain-error";

export class TransactionNotFoundError extends DomainError {
    constructor(identifier: string) {
        super(`Transaction ${identifier} not found`);
    }
}
