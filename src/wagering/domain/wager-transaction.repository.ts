import type { WagerTransaction } from "./wager-transaction.ts";

export abstract class WagerTransactionRepository {
    abstract insert(transaction: WagerTransaction): Promise<void>;
}
