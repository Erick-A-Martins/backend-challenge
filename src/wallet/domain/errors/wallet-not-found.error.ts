import { DomainError } from "../../../shared/domain/errors/domain-error";

export class WalletNotFoundError extends DomainError {
    constructor(walletId: string) {
        super(`Wallet ${walletId} not found`);
    }
}
