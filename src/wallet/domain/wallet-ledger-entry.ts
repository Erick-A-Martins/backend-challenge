import { Money } from "../../shared/domain/money.ts";
import {InvalidLedgerEntryError} from "../../shared/domain/errors/invalid-ledger-entry.error.ts";
import {LedgerDirection} from "./ledger-direction.ts";

export interface LedgerEntryState {
    id: string;
    walletId: string;
    transactionId: string;
    direction: LedgerDirection;
    money: Money;
    balanceBefore: Money;
    balanceAfter: Money;
    createdAt: Date;
}

export type CreateLedgerEntryProps = LedgerEntryState;

export class WalletLedgerEntry {
    private constructor(
        public readonly id: string,
        public readonly walletId: string,
        public readonly transactionId: string,
        public readonly direction: LedgerDirection,
        public readonly money: Money,
        public readonly balanceBefore: Money,
        public readonly balanceAfter: Money,
        public readonly createdAt: Date,
    ) {}

    static create(props: CreateLedgerEntryProps): WalletLedgerEntry {
        if (!props.money.isPositive()) {
            throw new InvalidLedgerEntryError("Ledger entry amount must be positive");
        }

        if (props.balanceAfter.isNegative()) {
            throw new InvalidLedgerEntryError("balanceAfter cannot be negative");
        }

        const entry = WalletLedgerEntry.build(props);

        if (!entry.isBalanced()) {
            throw new InvalidLedgerEntryError("balanceBefore and balanceAfter do not match the amount");
        }

        return entry;
    };

    static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
        return WalletLedgerEntry.build(state);
    };

    isBalanced(): boolean {
        const expected =
            this.direction === LedgerDirection.Debit
                ? this.balanceBefore.subtract(this.money)
                : this.balanceBefore.add(this.money);
        return expected.equals(this.balanceAfter);
    };

    private static build(props: LedgerEntryState): WalletLedgerEntry {
        return new WalletLedgerEntry(
            props.id,
            props.walletId,
            props.transactionId,
            props.direction,
            props.money,
            props.balanceBefore,
            props.balanceAfter,
            props.createdAt,
        );
    };
}
