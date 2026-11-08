import { IntegrationEvent, type EventContext } from "../../../shared/domain/integration-event";
import type { MoneyProps } from "../../../shared/domain/money";
import type { WagerTransaction } from "../wager-transaction";
import { defined } from "./event-support";

export interface WagerTransactionPendingReferenceData {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    kind: string;
    money: MoneyProps;
    referenceExternalTransactionId: string;
    attempt: number;
    nextAttemptAt: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
    override readonly eventType = "WagerTransactionPendingReference";
    override readonly version = 1;

    static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionPendingReference {
        return new WagerTransactionPendingReference({
            ...ctx,
            aggregateId: tx.walletId,
            data: {
                transactionId: tx.id,
                providerId: tx.providerId,
                externalTransactionId: tx.externalTransactionId,
                walletId: tx.walletId,
                playerId: tx.playerId,
                kind: tx.kind,
                money: tx.money.toJSON(),
                referenceExternalTransactionId: defined(tx.referenceExternalTransactionId, "reference"),
                attempt: tx.referenceAttempts,
                nextAttemptAt: defined(tx.nextAttemptAt, "nextAttemptAt").toISOString(),
            },
        });
    }
}
