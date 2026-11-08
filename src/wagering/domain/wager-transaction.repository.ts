import type { WagerTransaction } from "./wager-transaction.ts";

export abstract class WagerTransactionRepository {
    abstract insert(transaction: WagerTransaction): Promise<void>;
    abstract findByProviderAndExternalId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | null>;
    abstract hasProcessedReversalOf(transactionId: string): Promise<boolean>;
}
