import {WagerTransactionKind} from "./enums/wager-transaction-kind.ts";
import {Money} from "../../shared/domain/money.ts";
import {WagerTransactionStatus} from "./enums/wager-transaction-status.ts";
import {FailureCode} from "./enums/failure-code.ts";
import {LedgerDirection} from "../../wallet/domain/enums/ledger-direction.ts";
import {InvalidTransactionError} from "./errors/invalid-transaction.error.ts";
import {InvalidTransactionStateError} from "./errors/invalid-transaction-state.error.ts";

export const SYSTEM_PROVIDER_ID = "system";

export interface CreateWagerTransactionProps {
    id: string;
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    walletId: string;
    playerId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: Money;
    referenceExternalTransactionId?: string;
    createdAt: Date;
}

export interface CreateOpeningProps {
    id: string;
    walletId: string;
    playerId: string;
    money: Money;
    createdAt: Date;
}

export interface WagerTransactionState extends CreateWagerTransactionProps {
    status: WagerTransactionStatus;
    referenceTransactionId?: string;
    failureCode?: FailureCode;
    processedAt?: Date;
    referenceAttempts: number;
    nextAttemptAt?: Date;
    observedBalance?: Money;
}

const ALLOWED_REFERENCE_KINDS: Readonly<Record<WagerTransactionKind, readonly WagerTransactionKind[]>> = {
    [WagerTransactionKind.Opening]: [],
    [WagerTransactionKind.Bet]: [],
    [WagerTransactionKind.Win]: [WagerTransactionKind.Bet],
    [WagerTransactionKind.Loss]: [WagerTransactionKind.Bet],
    [WagerTransactionKind.Refund]: [WagerTransactionKind.Bet],
    [WagerTransactionKind.Rollback]: [
        WagerTransactionKind.Bet,
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
    ],
}

export class WagerTransaction {
    private constructor(
        public readonly id: string,
        public readonly providerId: string,
        public readonly externalTransactionId: string,
        public readonly idempotencyKey: string,
        public readonly payloadHash: string,
        public readonly walletId: string,
        public readonly playerId: string,
        public readonly roundId: string,
        public readonly gameId: string,
        public readonly kind: WagerTransactionKind,
        public readonly money: Money,
        public readonly referenceExternalTransactionId: string | undefined,
        public readonly createdAt: Date,
        private _status: WagerTransactionStatus,
        private _referenceTransactionId: string | undefined,
        private _failureCode: FailureCode | undefined,
        private _processedAt: Date | undefined,
        private _referenceAttempts: number,
        private _nextAttemptAt: Date | undefined,
        private _observedBalance: Money | undefined,
    ) {}

    /** Nasce em PENDING. Valida a exigência de referência por kind. */
    static create(props: CreateWagerTransactionProps): WagerTransaction {
        if (props.kind === WagerTransactionKind.Opening) {
            throw new InvalidTransactionError("OPENING is internal and cannot be submitted");
        }
        if (props.providerId === SYSTEM_PROVIDER_ID) {
            throw new InvalidTransactionError(`providerId "${SYSTEM_PROVIDER_ID}" is reserved`);
        }
        return WagerTransaction.createValidated(props);
    };

    static createOpening(props: CreateOpeningProps): WagerTransaction {
        return WagerTransaction.createValidated({
            id: props.id,
            providerId: SYSTEM_PROVIDER_ID,
            externalTransactionId: props.walletId,
            idempotencyKey: `${SYSTEM_PROVIDER_ID}:opening:${props.walletId}`,
            payloadHash: `opening:${props.walletId}`,
            walletId: props.walletId,
            playerId: props.playerId,
            roundId: "opening",
            gameId: "opening",
            kind: WagerTransactionKind.Opening,
            money: props.money,
            createdAt: props.createdAt,
        });
    }

    static rehydrate(state: WagerTransactionState): WagerTransaction {
        return new WagerTransaction(
            state.id,
            state.providerId,
            state.externalTransactionId,
            state.idempotencyKey,
            state.payloadHash,
            state.walletId,
            state.playerId,
            state.roundId,
            state.gameId,
            state.kind,
            state.money,
            state.referenceExternalTransactionId,
            state.createdAt,
            state.status,
            state.referenceTransactionId,
            state.failureCode,
            state.processedAt,
            state.referenceAttempts,
            state.nextAttemptAt,
            state.observedBalance,
        );
    };

    get status(): WagerTransactionStatus {
        return this._status;
    }

    get referenceTransactionId(): string | undefined {
        return this._referenceTransactionId;
    }

    get failureCode(): FailureCode | undefined {
        return this._failureCode;
    }

    get processedAt(): Date | undefined {
        return this._processedAt;
    }

    get referenceAttempts(): number {
        return this._referenceAttempts;
    }

    get nextAttemptAt(): Date | undefined {
        return this._nextAttemptAt;
    }

    get observedBalance(): Money | undefined {
        return this._observedBalance;
    }

    // ---- transições (lançam InvalidTransactionStateError se o estado atual for terminal)
    markProcessed(referenceTransactionId: string | undefined, at: Date): void {
        this.assertNotTerminal("process");
        if (this.requiresReference() && referenceTransactionId === undefined) {
            throw new InvalidTransactionError(`${this.kind} cannot be processed without a reference`);
        }

        this._status = WagerTransactionStatus.Processed;
        this._referenceTransactionId = referenceTransactionId;
        this._processedAt = at;
        this._nextAttemptAt = undefined;
    }

    markPendingReference(nextAttemptAt: Date): void {
        this.assertNotTerminal("mark as pending reference");
        this._status = WagerTransactionStatus.PendingReference;
        this._referenceAttempts += 1;
        this._nextAttemptAt = nextAttemptAt;
    };

    reject(code: FailureCode): void {
        this.assertNotTerminal("reject");
        this._status = WagerTransactionStatus.Rejected;
        this._failureCode = code;
        this._nextAttemptAt = undefined;
    };

    fail(code: FailureCode): void {
        this.assertNotTerminal("fail");
        this._status = WagerTransactionStatus.Failed;
        this._failureCode = code;
        this._nextAttemptAt = undefined;
    };

    // ---- consultas de domínio
    isTerminal(): boolean {
        return (
            this._status === WagerTransactionStatus.Processed ||
            this._status === WagerTransactionStatus.Rejected ||
            this._status === WagerTransactionStatus.Failed
        );
    };

    affectsBalance(): boolean {
        return this.kind !== WagerTransactionKind.Loss;
    };

    requiresReference(): boolean {
        return this.kind === WagerTransactionKind.Refund || this.kind === WagerTransactionKind.Rollback;
    };

    matchesPayload(payloadHash: string): boolean {
        return this.payloadHash === payloadHash;
    };

    recordObservedBalance(balance: Money): void {
        this._observedBalance = balance;
    }

    ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
        switch (this.kind) {
            case WagerTransactionKind.Opening:
            case WagerTransactionKind.Win:
            case WagerTransactionKind.Refund:
                return LedgerDirection.Credit;
            case WagerTransactionKind.Bet:
                return LedgerDirection.Debit;
            case WagerTransactionKind.Loss:
                throw new InvalidTransactionError("LOSS dows not generate a ledger entry");
            case WagerTransactionKind.Rollback: {
                if (!reference) {
                    throw new InvalidTransactionError("ROLLBACK needs its reference to define the direction")
                }

                return reference.ledgerDirectionFor() === LedgerDirection.Credit
                    ? LedgerDirection.Debit
                    : LedgerDirection.Credit;
            }
        }
    };

    checkReference(reference: WagerTransaction): FailureCode | undefined {
        if (!ALLOWED_REFERENCE_KINDS[this.kind].includes(reference.kind)) {
            return FailureCode.InvalidReferenceKind;
        }

        if (
            reference.providerId !== this.providerId ||
            reference.playerId !== this.playerId ||
            reference.walletId !== this.walletId ||
            reference.roundId !== this.roundId ||
            reference.money.currency !== this.money.currency
        ) {
            return FailureCode.ReferenceMismatch;
        }

        if (reference.status !== WagerTransactionStatus.Processed) {
            return FailureCode.ReferenceNotProcessed;
        }

        if (this.requiresReference() && !reference.money.equals(this.money)) {
            return FailureCode.AmountMismatch;
        }

        return undefined;
    }

    private static createValidated(props: CreateWagerTransactionProps): WagerTransaction {
        const required: Array<[string, string]> = [
            ['id', props.id],
            ['providerId', props.providerId],
            ['externalTransactionId', props.externalTransactionId],
            ['idempotencyKey', props.idempotencyKey],
            ['payloadHash', props.payloadHash],
            ['walletId', props.walletId],
            ['playerId', props.playerId],
            ['roundId', props.roundId],
            ['gameId', props.gameId],
        ];

        for (const [field, value] of required) {
            if (typeof value !== "string" || value.trim() === "") {
                throw new InvalidTransactionError(`${field} is required`);
            }
        }

        if (props.money.isNegative()) {
            throw new InvalidTransactionError("Amount cannot be negative");
        }

        const kind = props.kind;
        const affectsBalance = kind !== WagerTransactionKind.Loss;

        if (affectsBalance && !props.money.isPositive()) {
            throw new InvalidTransactionError(`${kind} amount must be positive`);
        }

        const requiresReference =
            kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback;
        const reference = props.referenceExternalTransactionId;

        if (requiresReference && (reference === undefined || reference.trim() === "")) {
            throw new InvalidTransactionError(`${kind} requires referenceExternalTransactionId`);
        }

        if (kind === WagerTransactionKind.Bet && reference !== undefined) {
            throw new InvalidTransactionError("BET cannot have a reference");
        }

        return new WagerTransaction(
            props.id,
            props.providerId,
            props.externalTransactionId,
            props.idempotencyKey,
            props.payloadHash,
            props.walletId,
            props.playerId,
            props.roundId,
            props.gameId,
            props.kind,
            props.money,
            props.referenceExternalTransactionId,
            props.createdAt,
            WagerTransactionStatus.Pending,
            undefined,
            undefined,
            undefined,
            0,
            undefined,
            undefined,
        );
    }

    private assertNotTerminal(operation: string): void {
        if (this.isTerminal()) {
            throw new InvalidTransactionStateError(operation, this._status);
        }
    }
}
