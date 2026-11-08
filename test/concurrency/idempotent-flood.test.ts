import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { IdempotencyConflictError } from "../../src/wagering/domain/errors/idempotency-conflict.error";
import { WagerTransactionKind as Kind } from "../../src/wagering/domain/enums/wager-transaction-kind";
import {
    buildUseCases, cmd, expectConsistent, ledgerCount, rowCount,
} from "../integration/support/fixtures";
import { createTestOrm, truncateAll } from "../integration/support/test-database";

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

describe("idempotência sob concorrência real", () => {
    test("a mesma aposta enviada 50 vezes em paralelo gera um único débito", async () => {
        const w = await newWallet("100.00");
        const command = cmd(w, Kind.Bet, "25.00", { id: "bet-flood" });

        const results = await Promise.all(Array.from({ length: 50 }, () => useCases.submit.execute(command)));

        expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
        expect(results.filter((r) => !r.idempotentReplay)).toHaveLength(1);
        expect(results.filter((r) => r.idempotentReplay)).toHaveLength(49);
        expect(results.every((r) => r.balance.amount === "75.00")).toBe(true);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        expect(await rowCount(orm, "wager_transactions")).toBe(2); // OPENING + a BET
        await expectConsistent(orm, w.id, "75.00");
        expect(await rowCount(orm, "outbox_messages")).toBe(4); // 2 da abertura + 2 da BET, e nenhum a mais
    });

    test("mesma chave com payloads diferentes em paralelo: um vence, o outro é conflito", async () => {
        const w = await newWallet("100.00");
        const a = cmd(w, Kind.Bet, "10.00", { id: "race-1" });
        const b = { ...a, money: { amount: "20.00", currency: "BRL" } };

        const results = await Promise.allSettled([useCases.submit.execute(a), useCases.submit.execute(b)]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(IdempotencyConflictError);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
    });

    test("50 requisições idênticas misturadas com 20 apostas distintas na mesma wallet", async () => {
        const w = await newWallet("1000.00");
        const repeated = cmd(w, Kind.Bet, "10.00", { id: "bet-repeated" });

        await Promise.all([
            ...Array.from({ length: 50 }, () => useCases.submit.execute(repeated)),
            ...Array.from({ length: 20 }, () => useCases.submit.execute(cmd(w, Kind.Bet, "5.00"))),
        ]);

        // 10,00 uma única vez + 20 × 5,00
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(21);
        await expectConsistent(orm, w.id, "890.00");
    });
});
