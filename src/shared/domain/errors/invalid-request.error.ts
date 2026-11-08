import { DomainError } from "./domain-error";

export class InvalidRequestError extends DomainError {
    constructor(message: string) {
        super(message);
    }
}
