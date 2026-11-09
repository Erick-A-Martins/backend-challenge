import { describe, expect, test } from "bun:test";
import { classifyError } from "../../../src/messaging/application/error-classifier";
import { InboxPayloadMismatchError } from "../../../src/messaging/domain/errors/inbox-payload-mismatch.error";
import { InvalidMoneyError } from "../../../src/shared/domain/errors/invalid-money.error";
import { InvalidRequestError } from "../../../src/shared/domain/errors/invalid-request.error";
import { DuplicateTransactionError } from "../../../src/wagering/domain/errors/duplicate-transaction.error";
import { IdempotencyConflictError } from "../../../src/wagering/domain/errors/idempotency-conflict.error";
import { InvalidTransactionError } from "../../../src/wagering/domain/errors/invalid-transaction.error";
import { WalletNotFoundError } from "../../../src/wallet/domain/errors/wallet-not-found.error";

describe("classifyError", () => {
    test.each([
        ["conflito de idempotência", new IdempotencyConflictError("k")],
        ["transação externa duplicada", new DuplicateTransactionError("p", "e")],
    ])("negócio (ack): %s", (_label, error) => expect(classifyError(error)).toBe("business"));

    test.each([
        ["payload inválido", new InvalidRequestError("x")],
        ["dinheiro inválido", new InvalidMoneyError("x")],
        ["transação inválida", new InvalidTransactionError("x")],
        ["wallet inexistente", new WalletNotFoundError("w")],
        ["messageId reutilizado com outro conteúdo", new InboxPayloadMismatchError("m")],
    ])("permanente (DLQ): %s", (_label, error) => expect(classifyError(error)).toBe("permanent"));

    test.each([
        ["deadlock", Object.assign(new Error("deadlock"), { code: "40P01" })],
        ["erro desconhecido", new Error("boom")],
        ["valor que nem é erro", "oops"],
    ])("transitório (retry): %s", (_label, error) => expect(classifyError(error)).toBe("transient"));
});
