import { describe, expect, test } from "bun:test";
import { Money } from "../../../src/shared/domain/money";
import { Sha256Hasher } from "../../../src/shared/infrastructure/sha256-hasher";
import { canonicalPayload, type PayloadFields } from "../../../src/wagering/domain/canonical-payload";
import { WagerTransactionKind } from "../../../src/wagering/domain/enums/wager-transaction-kind";

const base: PayloadFields = {
    providerId: "provider-a",
    externalTransactionId: "ext-1",
    playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
    walletId: "0192f291-27dd-7d3f-8071-5f8685deef37",
    roundId: "round-1",
    gameId: "game-1",
    kind: WagerTransactionKind.Bet,
    money: { amount: "25.00", currency: "BRL" },
};

describe("canonicalPayload", () => {
    test("é estável e independe de propriedades extras", () => {
        const withExtras = { ...base, ignored: "x" } as PayloadFields;
        expect(canonicalPayload(withExtras)).toBe(canonicalPayload(base));
    });

    test("referência ausente equivale a undefined", () => {
        expect(canonicalPayload({ ...base, referenceExternalTransactionId: undefined })).toBe(canonicalPayload(base));
    });

    test("dinheiro normalizado: '25' e '25.00' geram o mesmo payload", () => {
        const normalized = Money.from({ amount: "25", currency: "BRL" }).toJSON();
        expect(canonicalPayload({ ...base, money: normalized })).toBe(canonicalPayload(base));
    });

    test.each([
        ["providerId", { providerId: "provider-b" }],
        ["externalTransactionId", { externalTransactionId: "ext-2" }],
        ["playerId", { playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a2" }],
        ["walletId", { walletId: "0192f291-27dd-7d3f-8071-5f8685deef38" }],
        ["roundId", { roundId: "round-2" }],
        ["gameId", { gameId: "game-2" }],
        ["kind", { kind: WagerTransactionKind.Win }],
        ["valor", { money: { amount: "26.00", currency: "BRL" } }],
        ["moeda", { money: { amount: "25.00", currency: "USD" } }],
        ["referência", { referenceExternalTransactionId: "ext-0" }],
    ])("mudar %s muda o payload", (_label, change) => {
        expect(canonicalPayload({ ...base, ...change })).not.toBe(canonicalPayload(base));
    });
});

describe("Sha256Hasher", () => {
    test("produz o SHA-256 hexadecimal esperado", () => {
        expect(new Sha256Hasher().sha256("abc")).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
    });
});
