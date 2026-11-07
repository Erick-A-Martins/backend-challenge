import {DomainError} from "./domain-error.ts";

export class InvalidLedgerEntryError extends DomainError {
    constructor(message: string) {
        super(message);
    }
}
