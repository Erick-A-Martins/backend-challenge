import { InvalidRequestError } from "../../../shared/domain/errors/invalid-request.error";
import { isRecord, isUuid } from "../../../shared/application/input-parsing.ts";
import type { CreateWalletCommand } from "../../application/create-wallet.use-case";

export function parseCreateWalletRequest(body: unknown): CreateWalletCommand {
    if (!isRecord(body)) {
        throw new InvalidRequestError("body must be a JSON object");
    }

    const { playerId, initialBalance } = body;
    if (!isUuid(playerId)) {
        throw new InvalidRequestError("playerId must be a UUID");
    }
    if (!isRecord(initialBalance)) {
        throw new InvalidRequestError("initialBalance must be an object with amount and currency");
    }

    const { amount, currency } = initialBalance;
    if (typeof amount !== "string" || typeof currency !== "string") {
        throw new InvalidRequestError("initialBalance.amount and initialBalance.currency must be strings");
    }

    return {
        playerId: playerId.toLowerCase(),
        initialBalance: { amount, currency }
    };
}
