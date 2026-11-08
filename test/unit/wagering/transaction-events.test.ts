import { describe, expect, test } from "bun:test";
import { Money } from "../../../src/shared/domain/money";
import { buildTransactionEvents } from "../../../src/wagering/application/transaction-events";
import { FailureCode } from "../../../src/wagering/domain/enums/failure-code";
import { WagerTransaction } from "../../../src/wagering/domain/wager-transaction";
import { WagerTransactionKind as Kind } from "../../../src/wagering/domain/enums/wager-transaction-kind";
import { Wallet } from "../../../src/wallet/domain/wallet";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const LATER = new Date("2026-01-01T12:00:05.000Z");
const brl = (amount: string) => Money.from({ amount, currency: "BRL" });

const newWallet = () => Wallet.open({ id: "w1", playerId: "p1", initialBalance: brl("100.00"), now: NOW });

const newTx = (kind: Kind, amount: string, extra: { ref?: string } = {}) =>
    WagerTransaction.create({
        id: "t1", providerId: "provider-a", externalTransactionId: "ext-1", idempotencyKey: "k1", payloadHash: "h1",
        walletId: "w1", playerId: "p1", roundId: "r1", gameId: "g1", kind, money: brl(amount), createdAt: NOW,
        ...(extra.ref !== undefined ? { referenceExternalTransactionId: extra.ref } : {}),
    });

let counter = 0;
const context = { correlationId: "corr-1", causationId: "t1", occurredAt: NOW };
const nextEventId = () => `event-${++counter}`;

describe("buildTransactionEvents", () => {
    test("transação processada com mudança de saldo: Processed e BalanceChanged, nesta ordem", () => {
        const wallet = newWallet();
        const tx = newTx(Kind.Bet, "30.00");
        const entry = wallet.debit({ entryId: "l1", transactionId: "t1", amount: tx.money, at: NOW });
        tx.markProcessed(undefined, NOW);
        tx.recordObservedBalance(wallet.balance);

        const events = buildTransactionEvents({ transaction: tx, wallet, entry, context, nextEventId });

        expect(events.map((e) => e.eventType)).toEqual(["WagerTransactionProcessed", "WalletBalanceChanged"]);
        expect(events.every((e) => e.aggregateId === "w1")).toBe(true);
        expect(new Set(events.map((e) => e.eventId)).size).toBe(2);

        const [processed, changed] = events.map((e) => e.toJSON());
        expect(processed).toMatchObject({
            version: 1,
            correlationId: "corr-1",
            causationId: "t1",
            occurredAt: NOW.toISOString(),
            data: { transactionId: "t1", kind: "BET", balance: { amount: "70.00", currency: "BRL" }, processedAt: NOW.toISOString() },
        });
        expect(changed).toMatchObject({
            data: {
                walletId: "w1", transactionId: "t1", direction: "DEBIT",
                money: { amount: "30.00", currency: "BRL" },
                balanceBefore: { amount: "100.00", currency: "BRL" },
                balanceAfter: { amount: "70.00", currency: "BRL" },
                walletVersion: 2,
            },
        });
    });

    test("LOSS: só Processed (o saldo não mudou)", () => {
        const wallet = newWallet();
        const tx = newTx(Kind.Loss, "0.00");
        tx.markProcessed(undefined, NOW);
        tx.recordObservedBalance(wallet.balance);

        const events = buildTransactionEvents({ transaction: tx, wallet, entry: undefined, context, nextEventId });
        expect(events.map((e) => e.eventType)).toEqual(["WagerTransactionProcessed"]);
    });

    test("rejeitada: Rejected com o failureCode", () => {
        const wallet = newWallet();
        const tx = newTx(Kind.Bet, "500.00");
        tx.reject(FailureCode.InsufficientFunds);
        tx.recordObservedBalance(wallet.balance);

        const events = buildTransactionEvents({ transaction: tx, wallet, entry: undefined, context, nextEventId });
        expect(events.map((e) => e.eventType)).toEqual(["WagerTransactionRejected"]);
        expect(events[0]?.toJSON()).toMatchObject({ data: { failureCode: "INSUFFICIENT_FUNDS", kind: "BET" } });
    });

    test("referência ausente: PendingReference com tentativa e próxima tentativa", () => {
        const wallet = newWallet();
        const tx = newTx(Kind.Refund, "10.00", { ref: "ghost" });
        tx.markPendingReference(LATER);
        tx.recordObservedBalance(wallet.balance);

        const events = buildTransactionEvents({ transaction: tx, wallet, entry: undefined, context, nextEventId });
        expect(events.map((e) => e.eventType)).toEqual(["WagerTransactionPendingReference"]);
        expect(events[0]?.toJSON()).toMatchObject({
            data: { referenceExternalTransactionId: "ghost", attempt: 1, nextAttemptAt: LATER.toISOString() },
        });
    });

    test("transação ainda PENDING não gera evento", () => {
        const wallet = newWallet();
        const events = buildTransactionEvents({ transaction: newTx(Kind.Bet, "10.00"), wallet, entry: undefined, context, nextEventId });
        expect(events).toEqual([]);
    });

    test("o envelope omite causationId quando ele não existe", () => {
        const wallet = newWallet();
        const tx = newTx(Kind.Loss, "0.00");
        tx.markProcessed(undefined, NOW);
        tx.recordObservedBalance(wallet.balance);
        const [event] = buildTransactionEvents({
            transaction: tx, wallet, entry: undefined,
            context: { correlationId: "c", occurredAt: NOW } as never,
            nextEventId,
        });
        expect(event?.toJSON()).not.toHaveProperty("causationId");
    });
});
