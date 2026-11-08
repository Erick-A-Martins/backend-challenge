import { IntegrationEvent, type EventContext } from "../../../shared/domain/integration-event";
import type { MoneyProps } from "../../../shared/domain/money";
import type { WagerTransaction } from "../wager-transaction";
import { defined } from "./event-support";

export interface WagerTransactionRejectedData {
    transactionId: string;
    providerId: string;
    externalTransactionId: string;
    walletId: string;
    playerId: string;
    kind: string;
    money: MoneyProps;
    failureCode: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
    override readonly eventType = "WagerTransactionRejected";
    override readonly version = 1;

    static from(tx: WagerTransaction, ctx: EventContext): WagerTransactionRejected {
        return new WagerTransactionRejected({
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
                failureCode: defined(tx.failureCode, "failureCode"),
            },
        });
    }
}
