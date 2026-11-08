import {describe, expect, test} from "bun:test";
import {Money} from "../../../src/shared/domain/money";
import {InvalidTransactionError} from "../../../src/wagering/domain/errors/invalid-transaction.error";
import {FailureCode} from "../../../src/wagering/domain/enums/failure-code";
import {type CreateWagerTransactionProps, WagerTransaction} from "../../../src/wagering/domain/wager-transaction";
import {WagerTransactionKind as Kind} from "../../../src/wagering/domain/enums/wager-transaction-kind";
import {WagerTransactionStatus as Status} from "../../../src/wagering/domain/enums/wager-transaction-status";
import {LedgerDirection} from "../../../src/wallet/domain/enums/ledger-direction.ts";
import {InvalidTransactionStateError} from "../../../src/wagering/domain/errors/invalid-transaction-state.error.ts";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date("2026-01-01T00:01:00.000Z");
const brl = (amount: string) => Money.from({amount, currency: "BRL"});

const base: CreateWagerTransactionProps = {
    id: 't1',
    providerId: 'provider-a',
    externalTransactionId: 'ext-1',
    idempotencyKey: 'provider-a:ext-1',
    payloadHash: 'hash-1',
    walletId: 'w1',
    playerId: 'p1',
    roundId: 'r1',
    gameId: 'g1',
    kind: Kind.Bet,
    money: brl('25.00'),
    createdAt: NOW,
}

const make = (overrides: Partial<CreateWagerTransactionProps> = {}) =>
    WagerTransaction.create({...base, ...overrides});

const processed = (overrides: Partial<CreateWagerTransactionProps> = {}) => {
    const tx = make(overrides);
    tx.markProcessed(tx.requiresReference() ? 'ref-id' : undefined, NOW);
    return tx;
};

const reversal = (kind: Kind, overrides: Partial<CreateWagerTransactionProps> = {}) =>
    make({
        id: "t2",
        externalTransactionId: "ext-2",
        idempotencyKey: 'provider-a:ext-2',
        kind,
        referenceExternalTransactionId: 'ext-1',
        ...overrides
    });

describe("WagerTransaction.create", () => {

    test("nasce em PENDING passa sem falha e sem tentativas", () => {
        const tx = make();

        expect(tx.status).toBe(Status.Pending);
        expect(tx.failureCode).toBeUndefined();
        expect(tx.referenceAttempts).toBe(0);
        expect(tx.isTerminal()).toBe(false);
    });

    test("OPENING nao pode ser submetido", () => {
        expect(() => make({ kind: Kind.Opening })).toThrow(InvalidTransactionError);
    });

    test("BET nao pode ter referecia", () => {
        expect(() => make({ referenceExternalTransactionId: "ext-0" })).toThrow(InvalidTransactionError);
    });

    test.each([Kind.Refund, Kind.Rollback])("%s exige referencia", (kind) => {
        expect(() => make({ kind })).toThrow(InvalidTransactionError);
        expect(() => make({ kind, referenceExternalTransactionId: "  " })).toThrow(InvalidTransactionError);
    });

    test("campos obrigatorios", () => {
        expect(() => make({ providerId: "" })).toThrow(InvalidTransactionError);
        expect(() => make({ walletId: "   " })).toThrow(InvalidTransactionError);
    });

    test.each([Kind.Bet, Kind.Win])("%s com valor zero e rejeitado", (kind) => {
        expect(() => make({ kind, money: brl("0.00") })).toThrow(InvalidTransactionError);
    });

    test("LOSS aceitando valor zero", () => {
        expect(make({ kind: Kind.Loss, money: brl('0.00') }).affectsBalance()).toBe(false);
    });

    test("valor negativo rejeitado", () => {
        expect(() => make({ money: brl("1.00").negate() })).toThrow(InvalidTransactionError);
    });

});

describe("WagerTransaction.createOpening", () => {
    test("usa convencao do sistema e credita", () => {
        const tx = WagerTransaction.createOpening({
            id: 't0',
            walletId: 'w1',
            playerId: 'p1',
            money: brl('1000.00'),
            createdAt: NOW,
        });
        expect(tx.kind).toBe(Kind.Opening);
        expect(tx.providerId).toBe('system');
        expect(tx.externalTransactionId).toBe('w1');
        expect(tx.idempotencyKey).toBe('system:opening:w1');
        expect(tx.status).toBe(Status.Pending);
        expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    test("saldo inicial zero nao gera OPENING", () => {
        expect(() =>
            WagerTransaction.createOpening({ id: "t0", walletId: "w1", playerId: "p1", money: brl("0.00"), createdAt: NOW })
        ).toThrow(InvalidTransactionError);
    });
});

describe("consultas de dominio", () => {
    test("affectsBalance", () => {
        expect(make({ kind: Kind.Loss }).affectsBalance()).toBe(false);
        expect(make().affectsBalance()).toBe(true);
        expect(make({ kind: Kind.Win }).affectsBalance()).toBe(true);
    });

    test("requiresReference", () => {
        expect(make().requiresReference()).toBe(false);
        expect(reversal(Kind.Refund).requiresReference()).toBe(true);
        expect(reversal(Kind.Rollback).requiresReference()).toBe(true);
    });

    test("matchesPayload", () => {
        const tx = make();
        expect(tx.matchesPayload("hash-1")).toBe(true);
        expect(tx.matchesPayload("hash-OTHER")).toBe(false);
    });

    test("providerId 'system' é reservado", () => {
        expect(() => make({ providerId: "system" })).toThrow(InvalidTransactionError);
    });

    test("registra o saldo observado", () => {
        const tx = make();
        expect(tx.observedBalance).toBeUndefined();
        tx.recordObservedBalance(brl("70.00"));
        expect(tx.observedBalance?.toString()).toBe("70.00");
    });
});

describe("ledgerDirectionFor", () => {
    test("BET debita, WIN e REFUND creditam", () => {
        expect(make().ledgerDirectionFor()).toBe(LedgerDirection.Debit);
        expect(make({ kind: Kind.Win }).ledgerDirectionFor()).toBe(LedgerDirection.Credit);
        expect(reversal(Kind.Refund).ledgerDirectionFor()).toBe(LedgerDirection.Credit);
    });

    test("LOSS nao gera lancamento", () => {
        expect(() => make({ kind: Kind.Loss }).ledgerDirectionFor()).toThrow(InvalidTransactionError);
    });

    test("ROLLBACK inverte a referencia", () => {
        const rollback = reversal(Kind.Rollback);

        expect(rollback.ledgerDirectionFor(make())).toBe(LedgerDirection.Credit);
        expect(rollback.ledgerDirectionFor(make({ kind: Kind.Win }))).toBe(LedgerDirection.Debit);
        expect(rollback.ledgerDirectionFor(reversal(Kind.Refund))).toBe(LedgerDirection.Debit);
    });

    test("ROLLBACK sem referencia", () => {
        expect(() => reversal(Kind.Rollback).ledgerDirectionFor()).toThrow(InvalidTransactionError);
    });
});

describe("checkReference", () => {
    test("REFUND de BET processada, mesmo valor: ok", () => {
        expect(reversal(Kind.Refund).checkReference(processed())).toBeUndefined();
    });

    test.each([Kind.Bet, Kind.Win, Kind.Refund])("ROLLBACK de %s processada: ok", (refKind) => {
        const ref =
            refKind === Kind.Refund
                ? processed({ kind: Kind.Refund, referenceExternalTransactionId: "ext-0" })
                : processed({ kind: refKind });
        expect(reversal(Kind.Rollback).checkReference(ref)).toBeUndefined();
    });

    test("WIN referenciando BET com valor diferente: ok", () => {
        const win = make({
            id: "t3",
            kind: Kind.Win,
            money: brl("50.00"),
            referenceExternalTransactionId: "ext-1"
        });
        expect(win.checkReference(processed())).toBeUndefined();
    });

    test("REFUND so referencia BET", () => {
        const win = processed({ kind: Kind.Win });
        expect(reversal(Kind.Refund).checkReference(win)).toBe(FailureCode.InvalidReferenceKind);
    });

    test("ROLLBACK nao referencia LOSS", () => {
        const loss = processed({ kind: Kind.Loss });
        expect(reversal(Kind.Rollback).checkReference(loss)).toBe(FailureCode.InvalidReferenceKind);
    });

    test.each([
        ["rodada", { roundId: "r2" }],
        ["wallet", { walletId: "w2" }],
        ["player", { playerId: "p2" }],
        ["provider", { providerId: 'provider-b' }],
        ["moeda", { money: Money.from({ amount: "25.00", currency: "USD" }) }],
    ])("divergencia de %s: REFERENCE_MISMATCH", (_label, override) => {
        expect(reversal(Kind.Refund).checkReference(processed(override))).toBe(FailureCode.ReferenceMismatch);
    });

    test("referencia nao processada: REFERENCE_NOT_PROCESSED", () => {
        expect(reversal(Kind.Refund).checkReference(make())).toBe(FailureCode.ReferenceNotProcessed);
    });

    test("referencia rejeitada: REFERENCE_NOT_PROCESSED", () => {
        const rejected = make();
        rejected.reject(FailureCode.InsufficientFunds);
        expect(reversal(Kind.Refund).checkReference(rejected)).toBe(FailureCode.ReferenceNotProcessed);
    });

    test("valor da reversão diferente da referência: AMOUNT_MISMATCH", () => {
        const partial = reversal(Kind.Refund, { money: brl("10.00") });
        expect(partial.checkReference(processed())).toBe(FailureCode.AmountMismatch);
    });
});

describe("transicoes", () => {
    test("PENDING para PROCESSED registra referencia e data", () => {
        const tx = reversal(Kind.Refund);
        tx.markProcessed("ref-id", LATER);
        expect(tx.status).toBe(Status.Processed);
        expect(tx.referenceTransactionId).toBe("ref-id");
        expect(tx.processedAt).toEqual(LATER);
        expect(tx.isTerminal()).toBe(true);
    });

    test("REFUND/ROLLBACK nao podem ser processados sem referencia", () => {
        expect(() => reversal(Kind.Refund).markProcessed(undefined, NOW)).toThrow(InvalidTransactionError);
    });

    test("PENDING para PENDING_REFERENCE conta tentativas e agenda a proxima", () => {
        const tx = reversal(Kind.Refund);
        tx.markPendingReference(LATER);
        expect(tx.status).toBe(Status.PendingReference);
        expect(tx.referenceAttempts).toBe(1);
        expect(tx.nextAttemptAt).toEqual(LATER);
        expect(tx.isTerminal()).toBe(false);

        tx.markPendingReference(new Date("2026-01-01T00:05:00.000Z"));
        expect(tx.referenceAttempts).toBe(2);
    });

    test("PENDING_REFERENCE para PROCESSED limpa o agendamento", () => {
        const tx = reversal(Kind.Refund);
        tx.markPendingReference(LATER);
        tx.markProcessed("ref-id", LATER);
        expect(tx.status).toBe(Status.Processed);
        expect(tx.nextAttemptAt).toBeUndefined();
    });

    test("reject e fail gravam o failureCode", () => {
        const rejected = make();
        rejected.reject(FailureCode.InsufficientFunds);
        expect(rejected.status).toBe(Status.Rejected);
        expect(rejected.failureCode).toBe(FailureCode.InsufficientFunds);

        const failed = make();
        failed.fail(FailureCode.UnrecoverableError);
        expect(failed.status).toBe(Status.Failed);
        expect(failed.failureCode).toBe(FailureCode.UnrecoverableError);
    });

    test("PENDING_REFERENCE esgotada pode ser rejeitada", () => {
        const tx = reversal(Kind.Refund);
        tx.markPendingReference(LATER);
        tx.reject(FailureCode.ReferenceNotFound);
        expect(tx.status).toBe(Status.Rejected);
        expect(tx.nextAttemptAt).toBeUndefined();
    });

    describe("estados terminais nao transicionam", () => {
        const terminals: Array<[string, () => WagerTransaction]> = [
            ["PROCESSED", () => processed()],
            ["REJECTED", () => { const t = make(); t.reject(FailureCode.InsufficientFunds); return t; }],
            ["FAILED", () => { const t = make(); t.fail(FailureCode.UnrecoverableError); return t; }],
        ];

        test.each(terminals)("%s", (_name, build) => {
            expect(() => build().markProcessed(undefined, NOW)).toThrow(InvalidTransactionStateError);
            expect(() => build().markPendingReference(NOW)).toThrow(InvalidTransactionStateError);
            expect(() => build().reject(FailureCode.InsufficientFunds)).toThrow(InvalidTransactionStateError);
            expect(() => build().fail(FailureCode.UnrecoverableError)).toThrow(InvalidTransactionStateError);
        });
    });
});

describe("rehydrate", () => {
    test("reconstroi estado sem validar transicoes", () => {
        const tx = WagerTransaction.rehydrate({
            ...base,
            status: Status.Rejected,
            failureCode: FailureCode.InsufficientFunds,
            referenceAttempts: 0,
        });

        expect(tx.status).toBe(Status.Rejected);
        expect(tx.isTerminal()).toBe(true);
    });
});
