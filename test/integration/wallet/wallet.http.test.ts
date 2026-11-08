import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import type { MikroORM } from "@mikro-orm/postgresql";
import { startTestApp } from "../support/test-app";
import { createTestOrm, query, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

let orm: MikroORM;
let app: INestApplication;
let baseUrl: string;

const send = (method: string, path: string, rawBody?: string) =>
    fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: rawBody,
    });

const post = (path: string, body: unknown) => send("POST", path, JSON.stringify(body));

const validBody = (amount = "1000.00", currency = "BRL", playerId = PLAYER) => ({
    playerId,
    initialBalance: { amount, currency },
});

const walletCount = async () =>
    (await query<{ n: number }>(orm, "select count(*)::int as n from wallets"))[0]?.n;

beforeAll(async () => {
    orm = await createTestOrm(); // também aplica as migrations
    ({ app, baseUrl } = await startTestApp());
});

beforeEach(async () => {
    await truncateAll(orm);
});

afterAll(async () => {
    await app.close();
    await orm.close();
});

describe("POST /wallets", () => {
    test("cria a wallet (201) no formato do contrato", async () => {
        const res = await post("/wallets", validBody("1000.00"));

        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({
            id: expect.any(String),
            playerId: PLAYER,
            balance: { amount: "1000.00", currency: "BRL" },
            version: 1,
        });
    });

    test("normaliza o playerId para minúsculas", async () => {
        const res = await post("/wallets", validBody("10.00", "BRL", PLAYER.toUpperCase()));
        expect(res.status).toBe(201);
        expect(((await res.json()) as { playerId: string }).playerId).toBe(PLAYER);
    });

    test("wallet duplicada: 409 WALLET_ALREADY_EXISTS", async () => {
        await post("/wallets", validBody());
        const res = await post("/wallets", validBody("5.00"));

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({
            error: { code: "WALLET_ALREADY_EXISTS", message: expect.any(String) },
        });
        expect(await walletCount()).toBe(1);
    });

    test.each([
        ["playerId ausente", { initialBalance: { amount: "1.00", currency: "BRL" } }],
        ["playerId não é UUID", validBody("1.00", "BRL", "abc")],
        ["initialBalance ausente", { playerId: PLAYER }],
        ["amount numérico", { playerId: PLAYER, initialBalance: { amount: 25, currency: "BRL" } }],
        ["amount com 3 casas", validBody("1.234")],
        ["amount negativo", validBody("-1.00")],
        ["amount em notação científica", validBody("1e3")],
        ["amount com 16 dígitos inteiros", validBody("1234567890123456.00")],
        ["moeda em minúsculas", validBody("1.00", "brl")],
    ])("payload inválido (%s): 400 e nada é gravado", async (_label, body) => {
        const res = await post("/wallets", body);

        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: { code: string } }).error.code).toStartWith("INVALID_");
        expect(await walletCount()).toBe(0);
    });

    test("JSON malformado: 400", async () => {
        const res = await send("POST", "/wallets", "{'playerId':");
        expect(res.status).toBe(400);
    });
});

describe("GET /wallets/:walletId", () => {
    test("devolve a wallet criada (200)", async () => {
        const created = (await (await post("/wallets", validBody("250.50"))).json()) as { id: string };

        const res = await send("GET", `/wallets/${created.id}`);

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            id: created.id,
            playerId: PLAYER,
            balance: { amount: "250.50", currency: "BRL" },
            version: 1,
        });
    });

    test("wallet inexistente: 404 WALLET_NOT_FOUND", async () => {
        const res = await send("GET", `/wallets/${Bun.randomUUIDv7()}`);

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({
            error: { code: "WALLET_NOT_FOUND", message: expect.any(String) },
        });
    });

    test("id que não é UUID: 400", async () => {
        const res = await send("GET", "/wallets/not-a-uuid");
        expect(res.status).toBe(400);
    });
});
