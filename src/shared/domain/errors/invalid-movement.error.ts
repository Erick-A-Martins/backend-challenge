import { DomainError } from "./domain-error.ts";

export class InvalidMovementError extends DomainError {
    constructor(message: string) {
        super(message);
    }
}
