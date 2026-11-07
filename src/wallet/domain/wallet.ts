import {Money} from "../../shared/domain/money.ts";
import {WalletLedgerEntry} from "./wallet-ledger-entry.ts";
import {CurrencyMismatchError} from "../../shared/domain/errors/currency-mismatch.error.ts";
import {InvalidMovementError} from "../../shared/domain/errors/invalid-movement.error.ts";
import {InsufficientFundsError} from "../../shared/domain/errors/insufficient-funds.error.ts";
import {LedgerDirection} from "./ledger-direction.ts";

export interface WalletState {
    id: string;
    playerId: string;
    currency: string;
    balance: Money;
    version: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface OpenWalletProps {
    id: string,
    playerId: string;
    initialBalance: Money;
    now: Date;
}

export interface MovementProps {
    entryId: string;
    transactionId: string;
    amount: Money;
    at: Date;
}

export class Wallet {
    private constructor(
        public readonly id: string,
        public readonly playerId: string,
        public readonly currency: string,
        private _balance: Money,
        private _version: number,
        public readonly createdAt: Date,
        private _updatedAt: Date,
    ) {
    }

    static open(props: OpenWalletProps) {
        if (props.initialBalance.isNegative()) {
            throw new InvalidMovementError("Initial balance cannot be negative");
        }

        return new Wallet(
            props.id,
            props.playerId,
            props.initialBalance.currency,
            props.initialBalance,
            1,
            props.now,
            props.now
        );
    }

    static rehydrate(state: WalletState): Wallet {
        return new Wallet(
            state.id,
            state.playerId,
            state.currency,
            state.balance,
            state.version,
            state.createdAt,
            state.updatedAt,
        );
    }

    get balance(): Money {
        return this._balance;
    }

    get version(): number {
        return this._version;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    debit(movement: MovementProps): WalletLedgerEntry {
        this.assertValidMovement(movement.amount);
        const after = this._balance.subtract(movement.amount);

        if (after.isNegative()) {
            throw new InsufficientFundsError();
        }

        return this.apply(LedgerDirection.Debit, after, movement);
    }

    credit(movement: MovementProps): WalletLedgerEntry {
        this.assertValidMovement(movement.amount);
        const after = this._balance.add(movement.amount);

        return this.apply(LedgerDirection.Credit, after, movement);
    }

    private apply(direction: LedgerDirection, after: Money, movement: MovementProps): WalletLedgerEntry {
        const entry = WalletLedgerEntry.create({
            id: movement.entryId,
            walletId: this.id,
            transactionId: movement.transactionId,
            direction,
            money: movement.amount,
            balanceBefore: this._balance,
            balanceAfter: after,
            createdAt: movement.at,
        });

        this._balance = after;
        this._version += 1;
        this._updatedAt = movement.at;

        return entry;
    }

    private assertValidMovement(amount: Money): void {
        if (amount.currency !== this.currency) {
            throw new CurrencyMismatchError(this.currency, amount.currency);
        }
        if (!amount.isPositive()) {
            throw new InvalidMovementError("Movement amount must be positive");
        }
    }
}
