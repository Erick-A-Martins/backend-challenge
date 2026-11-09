import { describe, expect, test } from "bun:test";
import { parseWagerRequestMessage } from "../../../src/messaging/application/wager-request-message";
import { InvalidRequestError } from "../../../src/shared/domain/errors/invalid-request.error";
import { Sha256Hasher } from "../../../src/shared/infrastructure/sha256-hasher";

const hasher = new Sha256Hasher();
const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";
const WALLET = "0192f291-27dd-7d3f-8071-5f8685deef37";

const message = (data: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
    messageId: "msg-123",
    type: "WagerTransactionRequested",
    occurredAt: "2026-07-29T15:00:00.000Z",
    data: {
        providerId: "provider-a",
        externalTransactionId: "transaction-123",
        idempotencyKey: "provider-a:transaction-123",
        playerId: PLAYER,
        walletId: WALLET,
        roundId: "round-987",
        gameId: "fortune-chimp",
        kind: "BET",
        money: { amount: "25.00", currency: "BRL" },
        ...data,
    },
    ...top,
});

const parse = (value: unknown) => parseWagerRequestMessage(JSON.stringify(value), hasher);

describe("parseWagerRequestMessage", () => {
    test("mensagem válida vira comando", () => {
        const parsed = parse(message());
        expect(parsed.messageId).toBe("msg-123");
        expect(parsed.occurredAt).toEqual(new Date("2026-07-29T15:00:00.000Z"));
        expect(parsed.command).toMatchObject({
            providerId: "provider-a",
            externalTransactionId: "transaction-123",
            idempotencyKey: "provider-a:transaction-123",
            playerId: PLAYER,
            walletId: WALLET,
            kind: "BET",
            money: { amount: "25.00", currency: "BRL" },
        });
    });

    test("o hash independe da ordem das chaves e muda com o conteúdo", () => {
        const original = parse(message());
        const reordered = parseWagerRequestMessage(
            JSON.stringify({ data: message().data, occurredAt: message().occurredAt, type: message().type, messageId: "msg-123" }),
            hasher,
        );
        expect(reordered.payloadHash).toBe(original.payloadHash);
        expect(parse(message({ money: { amount: "26.00", currency: "BRL" } })).payloadHash).not.toBe(original.payloadHash);
    });

    test.each([
        ["JSON inválido", "not json"],
        ["array", "[]"],
        ["type errado", JSON.stringify(message({}, { type: "Other" }))],
        ["messageId ausente", JSON.stringify(message({}, { messageId: undefined }))],
        ["occurredAt inválido", JSON.stringify(message({}, { occurredAt: "ontem" }))],
        ["data ausente", JSON.stringify(message({}, { data: undefined }))],
        ["idempotencyKey ausente", JSON.stringify(message({ idempotencyKey: undefined }))],
        ["kind OPENING", JSON.stringify(message({ kind: "OPENING" }))],
        ["walletId que não é UUID", JSON.stringify(message({ walletId: "abc" }))],
    ])("rejeita: %s", (_label, body) => {
        expect(() => parseWagerRequestMessage(body, hasher)).toThrow(InvalidRequestError);
    });
});
