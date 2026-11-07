import { DomainError } from "../../../shared/domain/errors/domain-error.ts";

export class WalletAlreadyExistsError extends DomainError {
    constructor(playerId: string, currency: string) {
        super(`Wallet already exists for player ${playerId} in ${currency}`);
    }
}
