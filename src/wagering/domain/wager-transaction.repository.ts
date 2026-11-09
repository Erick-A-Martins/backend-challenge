import type { WagerTransaction } from "./wager-transaction.ts";

export abstract class WagerTransactionRepository {
    abstract insert(transaction: WagerTransaction): Promise<void>;

    abstract update(transaction: WagerTransaction): Promise<void>;

    abstract findByProviderAndExternalId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | null>;

    abstract hasProcessedReversalOf(transactionId: string): Promise<boolean>;

    abstract findById(id: string): Promise<WagerTransaction | null>;

    abstract findByIdForUpdate(id: string): Promise<WagerTransaction | null>;

    /** Must be called inside a UnitOfWork; selected rows remain locked until it commits. */
    abstract findDuePendingReferencesForUpdate(now: Date, limit: number): Promise<WagerTransaction[]>;

    abstract findByProviderAndIdempotencyKey(
        providerId: string,
        idempotencyKey: string,
    ): Promise<WagerTransaction | null>;
}
