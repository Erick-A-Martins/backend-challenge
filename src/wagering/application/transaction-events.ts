import type { IntegrationEvent } from "../../shared/domain/integration-event";
import type { Wallet } from "../../wallet/domain/wallet";
import type { WalletLedgerEntry } from "../../wallet/domain/wallet-ledger-entry";
import { WagerTransactionPendingReference } from "../domain/events/wager-transaction-pending-reference.event";
import { WagerTransactionProcessed } from "../domain/events/wager-transaction-processed.event";
import { WagerTransactionRejected } from "../domain/events/wager-transaction-rejected.event";
import { WalletBalanceChanged } from "../domain/events/wallet-balance-changed.event";
import type { WagerTransaction } from "../domain/wager-transaction";
import { WagerTransactionStatus } from "../domain/enums/wager-transaction-status";

export interface TransactionEventsParams {
    transaction: WagerTransaction;
    wallet: Wallet;
    entry: WalletLedgerEntry | undefined;
    context: { correlationId: string; causationId: string; occurredAt: Date };
    nextEventId: () => string;
}

export function buildTransactionEvents(params: TransactionEventsParams): IntegrationEvent<unknown>[] {
    const { transaction, wallet, entry, context, nextEventId } = params;
    const eventContext = () => ({ eventId: nextEventId(), ...context });

    switch (transaction.status) {
        case WagerTransactionStatus.Processed: {
            const events: IntegrationEvent<unknown>[] = [
                WagerTransactionProcessed.from(transaction, eventContext()),
            ];
            
            if (entry) {
                events.push(WalletBalanceChanged.from(wallet, entry, eventContext()));
            }
            
            return events;
        }
        case WagerTransactionStatus.Rejected:
            return [WagerTransactionRejected.from(transaction, eventContext())];
        case WagerTransactionStatus.PendingReference:
            return [WagerTransactionPendingReference.from(transaction, eventContext())];
        default:
            return [];
    }
}
