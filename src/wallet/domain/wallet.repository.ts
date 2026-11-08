import type { Wallet } from "./wallet.ts";

export abstract class WalletRepository {
    abstract insert(wallet: Wallet): Promise<void>;
    abstract findById(id: string): Promise<Wallet | null>;
    abstract findByIdForUpdate(id: string): Promise<Wallet | null>;
    abstract update(wallet: Wallet): Promise<void>;
}
