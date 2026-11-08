import type { RequiredEntityData } from "@mikro-orm/core";
import { WagerTransaction } from "../../domain/wager-transaction";
import type { WagerTransactionRecord } from "./wager-transaction.record";
import type { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";
import { Money } from "../../../shared/domain/money";
import type { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import type { FailureCode } from "../../domain/enums/failure-code";

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

export function toWagerTransaction(record: WagerTransactionRecord): WagerTransaction {
    return WagerTransaction.rehydrate({
        id: record.id,
        providerId: record.providerId,
        externalTransactionId: record.externalTransactionId,
        idempotencyKey: record.idempotencyKey,
        payloadHash: record.payloadHash,
        walletId: record.walletId,
        playerId: record.playerId,
        roundId: record.roundId,
        gameId: record.gameId,
        kind: record.kind as WagerTransactionKind,
        money: Money.from({ amount: record.amount, currency: record.currency }),
        referenceExternalTransactionId: record.referenceExternalTransactionId ?? undefined,
        createdAt: record.createdAt,
        status: record.status as WagerTransactionStatus,
        referenceTransactionId: record.referenceTransactionId ?? undefined,
        failureCode: (record.failureCode ?? undefined) as FailureCode | undefined,
        processedAt: record.processedAt ?? undefined,
        referenceAttempts: record.referenceAttempts,
        nextAttemptAt: record.nextAttemptAt ?? undefined,
    });
}
