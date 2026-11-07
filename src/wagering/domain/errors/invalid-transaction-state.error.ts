import {DomainError} from "../../../shared/domain/errors/domain-error.ts";

export class InvalidTransactionStateError extends DomainError {
    constructor(operation: string, status: string) {
        super(`Cannot ${operation} a transaction in terminal status ${status}`);
    }
}
