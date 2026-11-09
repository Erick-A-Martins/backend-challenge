import { InvalidRequestError } from "../../shared/domain/errors/invalid-request.error.ts";
import {
    isRecord,
    optionalString,
    requireString,
    requireUuid,
} from "../../shared/application/input-parsing.ts";
import type { SubmitWagerTransactionCommand } from "./submit-wager-transaction.use-case.ts";
import { WagerTransactionKind } from "../domain/enums/wager-transaction-kind.ts";

const SUBMITTABLE_KINDS: readonly string[] = [
    WagerTransactionKind.Bet,
    WagerTransactionKind.Win,
    WagerTransactionKind.Loss,
    WagerTransactionKind.Refund,
    WagerTransactionKind.Rollback,
];

export function parseSubmitTransactionRequest(
    idempotencyKey: unknown,
    body: unknown,
): SubmitWagerTransactionCommand {
    const key = requireString(idempotencyKey, "Idempotency-Key header");

    if (!isRecord(body)) {
        throw new InvalidRequestError("body must be a JSON object");
    }

    const kind = body["kind"];
    if (typeof kind !== "string" || !SUBMITTABLE_KINDS.includes(kind)) {
        throw new InvalidRequestError(`kind must be one of ${SUBMITTABLE_KINDS.join(", ")}`);
    }

    const money = body["money"];
    if (!isRecord(money)) {
        throw new InvalidRequestError("money must be an object with amount and currency");
    }
    const amount = money["amount"];
    const currency = money["currency"];
    if (typeof amount !== "string" || typeof currency !== "string") {
        throw new InvalidRequestError("money.amount and money.currency must be strings");
    }

    const reference = optionalString(body["referenceExternalTransactionId"], "referenceExternalTransactionId");

    return {
        providerId: requireString(body["providerId"], "providerId"),
        externalTransactionId: requireString(body["externalTransactionId"], "externalTransactionId"),
        idempotencyKey: key,
        playerId: requireUuid(body["playerId"], "playerId"),
        walletId: requireUuid(body["walletId"], "walletId"),
        roundId: requireString(body["roundId"], "roundId"),
        gameId: requireString(body["gameId"], "gameId"),
        kind: kind as WagerTransactionKind,
        money: { amount, currency },
        ...(reference !== undefined ? { referenceExternalTransactionId: reference } : {}),
    };
}
