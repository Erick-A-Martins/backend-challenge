import { IntegrationEvent, type EventContext } from "../../../shared/domain/integration-event";
import type { MoneyProps } from "../../../shared/domain/money";
import type { WagerTransaction } from "../wager-transaction";
import { defined } from "./event-support";

export interface WagerTransactionProcessedData {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: string;
    money: MoneyProps;
    referenceTransactionId?: string;
    balance: MoneyProps;
    processedAt: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
    override readonly eventType = "WagerTransactionProcessed";
    override readonly version = 1;

    static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionProcessed {
        return new WagerTransactionProcessed({
            ...ctx,
            aggregateId: tx.walletId,
            data: {
                transactionId: tx.id,
                providerId: tx.providerId,
                externalTransactionId: tx.externalTransactionId,
                walletId: tx.walletId,
                playerId: tx.playerId,
                roundId: tx.roundId,
                gameId: tx.gameId,
                kind: tx.kind,
                money: tx.money.toJSON(),
                ...(tx.referenceTransactionId !== undefined ? { referenceTransactionId: tx.referenceTransactionId } : {}),
                balance: defined(tx.observedBalance, "observed balance").toJSON(),
                processedAt: defined(tx.processedAt, "processedAt").toISOString(),
            },
        });
    }
}
