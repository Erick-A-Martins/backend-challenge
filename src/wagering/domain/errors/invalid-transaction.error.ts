import { DomainError } from "../../../shared/domain/errors/domain-error.ts";

export class InvalidTransactionError extends DomainError {
    constructor(message: string) {
        super(message);
    }
}
