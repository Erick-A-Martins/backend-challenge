import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import type { MikroORM } from "@mikro-orm/postgresql";
import { startTestApp } from "../support/test-app";
import { createTestOrm, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

let orm: MikroORM;
let app: INestApplication;
let baseUrl: string;

const send = (method: string, path: string, options: { body?: unknown; key?: string } = {}) =>
    fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            "content-type": "application/json",
            ...(options.key !== undefined ? { "idempotency-key": options.key } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

const createWallet = async (amount = "100.00") =>
    (await (
        await send("POST", "/wallets", {
            body: { playerId: PLAYER, initialBalance: { amount, currency: "BRL" } },
        })
    ).json()) as { id: string };

const betBody = (walletId: string, overrides: Record<string, unknown> = {}) => ({
    providerId: "provider-a",
    externalTransactionId: "tx-1",
    playerId: PLAYER,
    walletId,
    roundId: "round-1",
    gameId: "game-1",
    kind: "BET",
    money: { amount: "25.00", currency: "BRL" },
    ...overrides,
});

const submit = (body: unknown, key: string | null = "provider-a:tx-1") =>
    send("POST", "/wagering/transactions", { body, key: key ?? undefined });

beforeAll(async () => {
    orm = await createTestOrm();
    ({ app, baseUrl } = await startTestApp());
});
beforeEach(async () => {
    await truncateAll(orm);
});
afterAll(async () => {
    await app.close();
    await orm.close();
});

describe("POST /wagering/transactions", () => {
    test("primeira vez: 201 com o contrato do README", async () => {
        const w = await createWallet("1000.00");
        const res = await submit(betBody(w.id));

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({
            transactionId: expect.any(String),
            status: "PROCESSED",
            balance: { amount: "975.00", currency: "BRL" },
            idempotentReplay: false,
        });
    });

    test("replay: 200, mesmo transactionId e idempotentReplay true", async () => {
        const w = await createWallet("1000.00");
        const first = (await (await submit(betBody(w.id))).json()) as { transactionId: string };

        const res = await submit(betBody(w.id));

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            transactionId: first.transactionId,
            status: "PROCESSED",
            balance: { amount: "975.00", currency: "BRL" },
            idempotentReplay: true,
        });
    });

    test("saldo insuficiente: 422 com failureCode", async () => {
        const w = await createWallet("10.00");
        const res = await submit(betBody(w.id));

        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ status: "REJECTED", failureCode: "INSUFFICIENT_FUNDS" });
    });

    test("referência ausente: 202 PENDING_REFERENCE", async () => {
        const w = await createWallet("100.00");
        const res = await submit(
            betBody(w.id, { kind: "REFUND", externalTransactionId: "refund-1", referenceExternalTransactionId: "ghost" }),
            "provider-a:refund-1",
        );

        expect(res.status).toBe(202);
        expect(await res.json()).toMatchObject({ status: "PENDING_REFERENCE" });
    });

    test("mesma chave com payload diferente: 409 IDEMPOTENCY_CONFLICT", async () => {
        const w = await createWallet("1000.00");
        await submit(betBody(w.id));

        const res = await submit(betBody(w.id, { money: { amount: "26.00", currency: "BRL" } }));

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({
            error: { code: "IDEMPOTENCY_CONFLICT", message: expect.any(String) },
        });
    });

    test("chave nova para a mesma transação externa: 409 DUPLICATE_TRANSACTION", async () => {
        const w = await createWallet("1000.00");
        await submit(betBody(w.id));

        const res = await submit(betBody(w.id), "another-key");

        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe("DUPLICATE_TRANSACTION");
    });

    test("sem Idempotency-Key: 400", async () => {
        const w = await createWallet();
        const res = await submit(betBody(w.id), null);
        expect(res.status).toBe(400);
    });

    test("wallet inexistente: 404", async () => {
        const res = await submit(betBody(Bun.randomUUIDv7()));
        expect(res.status).toBe(404);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe("WALLET_NOT_FOUND");
    });

    test.each([
        ["OPENING não pode ser submetido", { kind: "OPENING" }],
        ["kind desconhecido", { kind: "PAYOUT" }],
        ["provedor reservado", { providerId: "system" }],
        ["valor com 3 casas", { money: { amount: "1.234", currency: "BRL" } }],
        ["valor numérico", { money: { amount: 25, currency: "BRL" } }],
        ["REFUND sem referência", { kind: "REFUND" }],
        ["walletId que não é UUID", { walletId: "abc" }],
        ["roundId vazio", { roundId: "  " }],
    ])("payload inválido (%s): 400", async (_label, override) => {
        const w = await createWallet();
        const res = await submit(betBody(w.id, override));
        expect(res.status).toBe(400);
    });
});

describe("consultas de transação", () => {
    test("por id e por provedor + id externo", async () => {
        const w = await createWallet("1000.00");
        const created = (await (await submit(betBody(w.id))).json()) as { transactionId: string };

        const byId = await send("GET", `/wagering/transactions/${created.transactionId}`);
        expect(byId.status).toBe(200);
        expect(await byId.json()).toMatchObject({
            transactionId: created.transactionId,
            providerId: "provider-a",
            externalTransactionId: "tx-1",
            kind: "BET",
            status: "PROCESSED",
            money: { amount: "25.00", currency: "BRL" },
        });

        const byExternal = await send("GET", "/providers/provider-a/wagering/transactions/tx-1");
        expect(byExternal.status).toBe(200);
        expect(((await byExternal.json()) as { transactionId: string }).transactionId).toBe(created.transactionId);
    });

    test("inexistente: 404 TRANSACTION_NOT_FOUND", async () => {
        const res = await send("GET", `/wagering/transactions/${Bun.randomUUIDv7()}`);
        expect(res.status).toBe(404);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe("TRANSACTION_NOT_FOUND");

        const res2 = await send("GET", "/providers/provider-a/wagering/transactions/nope");
        expect(res2.status).toBe(404);
    });

    test("id que não é UUID: 400", async () => {
        const res = await send("GET", "/wagering/transactions/not-a-uuid");
        expect(res.status).toBe(400);
    });
});
