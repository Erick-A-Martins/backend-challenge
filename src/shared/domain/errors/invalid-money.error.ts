import { DomainError } from "./domain-error.ts";

export class InvalidMoneyError extends DomainError {
    constructor(message: string) {
        super(message);
    }
}
