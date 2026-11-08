import type { MoneyProps } from "../../shared/domain/money";
import type { WagerTransaction } from "../domain/wager-transaction";

export interface WagerTransactionView {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: string;
    money: MoneyProps;
    referenceExternalTransactionId?: string;
    status: string;
    failureCode?: string;
    processedAt?: string;
    createdAt: string;
}

export function toWagerTransactionView(tx: WagerTransaction): WagerTransactionView {
    return {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        walletId: tx.walletId,
        playerId: tx.playerId,
        roundId: tx.roundId,
        gameId: tx.gameId,
        kind: tx.kind,
        money: tx.money.toJSON(),
        referenceExternalTransactionId: tx.referenceExternalTransactionId,
        status: tx.status,
        failureCode: tx.failureCode,
        processedAt: tx.processedAt?.toISOString(),
        createdAt: tx.createdAt.toISOString(),
    };
}
