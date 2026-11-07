import type { RequiredEntityData } from "@mikro-orm/core";
import type { WagerTransaction } from "../../domain/wager-transaction";
import type { WagerTransactionRecord } from "./wager-transaction.record";

export function toWagerTransactionRecord(tx: WagerTransaction): RequiredEntityData<WagerTransactionRecord> {
    return {
        id: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        idempotencyKey: tx.idempotencyKey,
        payloadHash: tx.payloadHash,
        walletId: tx.walletId,
        playerId: tx.playerId,
        roundId: tx.roundId,
        gameId: tx.gameId,
        kind: tx.kind,
        amount: tx.money.toString(),
        currency: tx.money.currency,
        referenceExternalTransactionId: tx.referenceExternalTransactionId ?? null,
        referenceTransactionId: tx.referenceTransactionId ?? null,
        status: tx.status,
        failureCode: tx.failureCode ?? null,
        processedAt: tx.processedAt ?? null,
        referenceAttempts: tx.referenceAttempts,
        nextAttemptAt: tx.nextAttemptAt ?? null,
        createdAt: tx.createdAt,
    };
}
