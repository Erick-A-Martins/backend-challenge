import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { DuplicateTransactionError } from "../../../src/wagering/domain/errors/duplicate-transaction.error";
import { IdempotencyConflictError } from "../../../src/wagering/domain/errors/idempotency-conflict.error";
import { FailureCode } from "../../../src/wagering/domain/enums/failure-code";
import { WagerTransactionKind as Kind } from "../../../src/wagering/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus as Status } from "../../../src/wagering/domain/enums/wager-transaction-status";
import {
    buildUseCases, cmd, expectConsistent, ledgerCount, rowCount, transactionRow,
} from "../support/fixtures";
import { createTestOrm, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

let orm: MikroORM;
let useCases: ReturnType<typeof buildUseCases>;

const newWallet = (amount = "100.00") =>
    useCases.createWallet.execute({ playerId: PLAYER, initialBalance: { amount, currency: "BRL" } });

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

describe("replay", () => {
    test("repetição idêntica devolve o resultado original, com o saldo da época", async () => {
        const w = await newWallet("100.00");
        const first = cmd(w, Kind.Bet, "30.00", { id: "bet-1" });

        const original = await useCases.submit.execute(first); // saldo 70
        await useCases.submit.execute(cmd(w, Kind.Bet, "20.00")); // saldo 50

        const replay = await useCases.submit.execute(first);

        expect(original.idempotentReplay).toBe(false);
        expect(replay).toEqual({ ...original, idempotentReplay: true });
        expect(replay.balance).toEqual({ amount: "70.00", currency: "BRL" }); // não os 50 de agora
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(2); // nenhum débito novo
        await expectConsistent(orm, w.id, "50.00");
    });

    test("payload equivalente (dinheiro '30' em vez de '30.00') também é replay", async () => {
        const w = await newWallet("100.00");
        const first = cmd(w, Kind.Bet, "30.00", { id: "bet-1" });
        const original = await useCases.submit.execute(first);

        const replay = await useCases.submit.execute({ ...first, money: { amount: "30", currency: "BRL" } });

        expect(replay.idempotentReplay).toBe(true);
        expect(replay.transactionId).toBe(original.transactionId);
    });

    test("replay de uma rejeição devolve a mesma rejeição e o saldo da época", async () => {
        const w = await newWallet("20.00");
        const rejectedCommand = cmd(w, Kind.Bet, "80.00", { id: "bet-x" });
        const original = await useCases.submit.execute(rejectedCommand);
        await useCases.submit.execute(cmd(w, Kind.Bet, "10.00")); // saldo 10

        const replay = await useCases.submit.execute(rejectedCommand);

        expect(original.status).toBe(Status.Rejected);
        expect(replay).toEqual({ ...original, idempotentReplay: true });
        expect(replay.failureCode).toBe(FailureCode.InsufficientFunds);
        expect(replay.balance.amount).toBe("20.00");
        await expectConsistent(orm, w.id, "10.00");
    });

    test("replay de LOSS", async () => {
        const w = await newWallet("100.00");
        const loss = cmd(w, Kind.Loss, "0.00", { id: "loss-1" });
        const original = await useCases.submit.execute(loss);
        const replay = await useCases.submit.execute(loss);

        expect(replay).toEqual({ ...original, idempotentReplay: true });
        await expectConsistent(orm, w.id, "100.00");
    });

    test("replay de PENDING_REFERENCE devolve o estado e não conta nova tentativa", async () => {
        const w = await newWallet("100.00");
        const pending = cmd(w, Kind.Refund, "10.00", { id: "refund-1", ref: "ghost" });
        const original = await useCases.submit.execute(pending);
        const replay = await useCases.submit.execute(pending);

        expect(original.status).toBe(Status.PendingReference);
        expect(replay).toEqual({ ...original, idempotentReplay: true });
        expect((await transactionRow(orm, "refund-1"))?.reference_attempts).toBe(1);
    });
});

describe("conflitos", () => {
    test("mesma chave com payload diferente: IdempotencyConflictError, sem efeitos", async () => {
        const w = await newWallet("100.00");
        const original = cmd(w, Kind.Bet, "30.00", { id: "bet-1" });
        await useCases.submit.execute(original);

        const tampered = { ...original, money: { amount: "31.00", currency: "BRL" } };

        await expect(useCases.submit.execute(tampered)).rejects.toThrow(IdempotencyConflictError);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        await expectConsistent(orm, w.id, "70.00");
    });

    test("chave nova para a mesma transação externa: DuplicateTransactionError", async () => {
        const w = await newWallet("100.00");
        const original = cmd(w, Kind.Bet, "30.00", { id: "bet-1" });
        await useCases.submit.execute(original);

        await expect(
            useCases.submit.execute({ ...original, idempotencyKey: "another-key" }),
        ).rejects.toThrow(DuplicateTransactionError);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        await expectConsistent(orm, w.id, "70.00");
    });

    test("o mesmo externalTransactionId em provedores diferentes não conflita", async () => {
        const w = await newWallet("100.00");
        const a = cmd(w, Kind.Bet, "10.00", { id: "same-id" });
        const b = { ...a, providerId: "provider-b", idempotencyKey: "provider-b:same-id" };

        const [ra, rb] = await Promise.all([useCases.submit.execute(a), useCases.submit.execute(b)]);

        expect(ra.status).toBe(Status.Processed);
        expect(rb.status).toBe(Status.Processed);
        expect(await rowCount(orm, "wager_transactions")).toBe(3); // OPENING + 2
        await expectConsistent(orm, w.id, "80.00");
    });
});
