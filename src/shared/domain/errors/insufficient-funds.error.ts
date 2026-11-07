import {DomainError} from "./domain-error.ts";

export class InsufficientFundsError extends DomainError {
    constructor() {
        super("Insufficient funds");
    }
}
