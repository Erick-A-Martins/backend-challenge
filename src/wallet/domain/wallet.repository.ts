import type { Wallet } from "./wallet.ts";

export abstract class WalletRepository {
    abstract insert(wallet: Wallet): Promise<void>;
}
