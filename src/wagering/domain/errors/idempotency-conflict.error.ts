import { DomainError } from "../../../shared/domain/errors/domain-error";

export class IdempotencyConflictError extends DomainError {
    constructor(idempotencyKey: string) {
        super(`Idempotency key "${idempotencyKey}" was already used with a different payload`);
    }
}
