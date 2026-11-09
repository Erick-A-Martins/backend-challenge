import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { OutboxRepository } from "../../../src/outbox/domain/outbox.repository";
import { FailureCode } from "../../../src/wagering/domain/enums/failure-code";
import { WagerTransactionKind as Kind } from "../../../src/wagering/domain/enums/wager-transaction-kind";
import { WalletLedgerRepository } from "../../../src/wallet/domain/wallet-ledger.repository";
import { AT, buildUseCases, cmd, expectConsistent, ledgerCount, rowCount, walletState } from "../support/fixtures";
import { createTestOrm, query, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

class FailingOutboxRepository extends OutboxRepository {
    override async append(): Promise<void> {
        throw new Error("outbox boom");
    }
    override async claimDue(): Promise<never[]> {
        return [];
    }
    override async markPublished(): Promise<boolean> {
        return false;
    }
    override async release(): Promise<boolean> {
        return false;
    }
}

class FailingLedgerRepository extends WalletLedgerRepository {
    override async append(): Promise<void> {
        throw new Error("ledger boom");
    }
}

interface OutboxRow {
    event_type: string;
    aggregate_id: string;
    payload: Record<string, unknown>;
    attempts: number;
    published_at: string | null;
}

let orm: MikroORM;
let useCases: ReturnType<typeof buildUseCases>;

const newWallet = (amount = "100.00", correlationId?: string) =>
    useCases.createWallet.execute({
        playerId: PLAYER,
        initialBalance: { amount, currency: "BRL" },
        ...(correlationId !== undefined ? { correlationId } : {}),
    });

const eventsOf = async (transactionId: string) =>
    (
        await query<OutboxRow>(
            orm,
            `select event_type, aggregate_id, payload, attempts, published_at
         from outbox_messages where payload->>'causationId' = ? order by event_type`,
            [transactionId],
        )
    );

const eventTypes = (rows: OutboxRow[]) => rows.map((row) => row.event_type);

beforeAll(async () => {
    orm = await createTestOrm();
    useCases = buildUseCases(orm);
});
beforeEach(async () => {
    await truncateAll(orm);
});
afterAll(async () => {
    await orm.close();
});

describe("eventos nascem com a mudança financeira", () => {
    test("BET processada: Processed e BalanceChanged, pendentes de publicação", async () => {
        const w = await newWallet("100.00");
        const result = await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1", correlationId: "corr-1" }));

        const events = await eventsOf(result.transactionId);

        expect(eventTypes(events)).toEqual(["WagerTransactionProcessed", "WalletBalanceChanged"]);
        for (const event of events) {
            expect(event.aggregate_id).toBe(w.id);
            expect(event.attempts).toBe(0);
            expect(event.published_at).toBeNull();
            expect(event.payload).toMatchObject({ aggregateId: w.id, correlationId: "corr-1", causationId: result.transactionId, version: 1 });
        }

        const changed = events.find((e) => e.event_type === "WalletBalanceChanged");
        expect(changed?.payload).toMatchObject({
            data: {
                walletId: w.id,
                transactionId: result.transactionId,
                direction: "DEBIT",
                money: { amount: "30.00", currency: "BRL" },
                balanceBefore: { amount: "100.00", currency: "BRL" },
                balanceAfter: { amount: "70.00", currency: "BRL" },
                walletVersion: 2,
            },
        });

        const processed = events.find((e) => e.event_type === "WagerTransactionProcessed");
        expect(processed?.payload).toMatchObject({
            data: {
                transactionId: result.transactionId,
                providerId: "provider-a",
                externalTransactionId: "bet-1",
                kind: "BET",
                balance: { amount: "70.00", currency: "BRL" },
                processedAt: AT.toISOString(),
            },
        });
    });

    test("criação de wallet com saldo: OPENING emite Processed e BalanceChanged (CREDIT, versão 1)", async () => {
        const w = await newWallet("1000.00", "corr-wallet");
        const [opening] = await query<{ id: string }>(orm, "select id from wager_transactions where wallet_id = ?", [w.id]);

        const events = await eventsOf(opening?.id ?? "");

        expect(eventTypes(events)).toEqual(["WagerTransactionProcessed", "WalletBalanceChanged"]);
        expect(events.find((e) => e.event_type === "WalletBalanceChanged")?.payload).toMatchObject({
            correlationId: "corr-wallet",
            data: {
                direction: "CREDIT",
                balanceBefore: { amount: "0.00", currency: "BRL" },
                balanceAfter: { amount: "1000.00", currency: "BRL" },
                walletVersion: 1,
            },
        });
    });

    test("wallet com saldo zero não emite eventos", async () => {
        await newWallet("0.00");
        expect(await rowCount(orm, "outbox_messages")).toBe(0);
    });

    test("LOSS: só Processed (saldo não mudou)", async () => {
        const w = await newWallet("100.00");
        const result = await useCases.submit.execute(cmd(w, Kind.Loss, "0.00", { id: "loss-1" }));
        expect(eventTypes(await eventsOf(result.transactionId))).toEqual(["WagerTransactionProcessed"]);
    });

    test("rejeição: Rejected com failureCode, sem BalanceChanged", async () => {
        const w = await newWallet("20.00");
        const result = await useCases.submit.execute(cmd(w, Kind.Bet, "80.00"));

        const events = await eventsOf(result.transactionId);
        expect(eventTypes(events)).toEqual(["WagerTransactionRejected"]);
        expect(events[0]?.payload).toMatchObject({ data: { failureCode: FailureCode.InsufficientFunds } });
    });

    test("referência ausente: PendingReference com tentativa 1", async () => {
        const w = await newWallet("100.00");
        const result = await useCases.submit.execute(cmd(w, Kind.Refund, "10.00", { id: "refund-1", ref: "ghost" }));

        const events = await eventsOf(result.transactionId);
        expect(eventTypes(events)).toEqual(["WagerTransactionPendingReference"]);
        expect(events[0]?.payload).toMatchObject({
            data: {
                referenceExternalTransactionId: "ghost",
                attempt: 1,
                nextAttemptAt: new Date(AT.getTime() + 5_000).toISOString(),
            },
        });
    });

    test("replay de idempotência não gera eventos novos", async () => {
        const w = await newWallet("100.00");
        const command = cmd(w, Kind.Bet, "30.00", { id: "bet-1" });
        await useCases.submit.execute(command);
        const before = await rowCount(orm, "outbox_messages");

        await useCases.submit.execute(command);
        await useCases.submit.execute(command);

        expect(await rowCount(orm, "outbox_messages")).toBe(before);
    });
});

describe("atomicidade entre mudança financeira e outbox", () => {
    test("falha ao gravar a outbox desfaz transação, saldo e ledger", async () => {
        const w = await newWallet("100.00"); // gera 2 eventos de abertura
        const failing = buildUseCases(orm, undefined, new FailingOutboxRepository()).submit;

        await expect(failing.execute(cmd(w, Kind.Bet, "30.00"))).rejects.toThrow("outbox boom");

        expect((await walletState(orm, w.id))?.version).toBe(1);
        expect(await rowCount(orm, "wager_transactions")).toBe(1); // só o OPENING
        expect(await ledgerCount(orm, w.id)).toBe(1); // só a abertura
        expect(await rowCount(orm, "outbox_messages")).toBe(2); // só os eventos da abertura
        await expectConsistent(orm, w.id, "100.00");
    });

    test("falha ao gravar o ledger não deixa eventos órfãos na outbox", async () => {
        const w = await newWallet("100.00");
        const failing = buildUseCases(orm, new FailingLedgerRepository()).submit;

        await expect(failing.execute(cmd(w, Kind.Bet, "30.00"))).rejects.toThrow("ledger boom");

        expect(await rowCount(orm, "outbox_messages")).toBe(2); // só os eventos da abertura
        await expectConsistent(orm, w.id, "100.00");
    });
});
