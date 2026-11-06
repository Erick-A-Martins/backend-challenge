import {DomainError} from "./domain-error.ts";

export class CurrencyMismatchError extends DomainError {
    constructor(left: string, right: string) {
        super(`Currency mismatch: ${left} vs ${right}`);
    }
}
