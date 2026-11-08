import { IntegrationEvent, type EventContext } from "../../../shared/domain/integration-event";
import type { MoneyProps } from "../../../shared/domain/money";
import type { Wallet } from "../../../wallet/domain/wallet";
import type { WalletLedgerEntry } from "../../../wallet/domain/wallet-ledger-entry";

export interface WalletBalanceChangedData {
    walletId: string;
    transactionId: string;
    direction: string;
    money: MoneyProps;
    balanceBefore: MoneyProps;
    balanceAfter: MoneyProps;
    walletVersion: number;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
    override readonly eventType = "WalletBalanceChanged";
    override readonly version = 1;

    static from(wallet: Wallet, entry: WalletLedgerEntry, ctx: EventContext): WalletBalanceChanged {
        return new WalletBalanceChanged({
            ...ctx,
            aggregateId: wallet.id,
            data: {
                walletId: wallet.id,
                transactionId: entry.transactionId,
                direction: entry.direction,
                money: entry.money.toJSON(),
                balanceBefore: entry.balanceBefore.toJSON(),
                balanceAfter: entry.balanceAfter.toJSON(),
                walletVersion: wallet.version,
            },
        });
    }
}
