import type { Hasher } from "../../shared/application/hasher";
import { isRecord, requireString } from "../../shared/application/input-parsing";
import { canonicalJson } from "../../shared/domain/canonical-json";
import { InvalidRequestError } from "../../shared/domain/errors/invalid-request.error";
import { parseSubmitTransactionRequest } from "../../wagering/application/submit-transaction.parser";
import type { SubmitWagerTransactionCommand } from "../../wagering/application/submit-wager-transaction.use-case";

export const WAGER_REQUEST_TYPE = "WagerTransactionRequested";

export interface WagerRequestMessage {
    messageId: string;
    occurredAt: Date;
    payloadHash: string;
    command: SubmitWagerTransactionCommand;
}

export function parseWagerRequestMessage(body: string, hasher: Hasher): WagerRequestMessage {
    let json: unknown;
    try {
        json = JSON.parse(body);
    } catch {
        throw new InvalidRequestError("message body is not valid JSON");
    }
    if (!isRecord(json)) {
        throw new InvalidRequestError("message must be a JSON object");
    }
    if (json["type"] !== WAGER_REQUEST_TYPE) {
        throw new InvalidRequestError(`type must be ${WAGER_REQUEST_TYPE}`);
    }

    const messageId = requireString(json["messageId"], "messageId");

    const rawOccurredAt = json["occurredAt"];
    const occurredAt = typeof rawOccurredAt === "string" ? new Date(rawOccurredAt) : undefined;
    if (occurredAt === undefined || Number.isNaN(occurredAt.getTime())) {
        throw new InvalidRequestError("occurredAt must be an ISO-8601 date");
    }

    const data = json["data"];
    if (!isRecord(data)) {
        throw new InvalidRequestError("data must be an object");
    }
    
    const command = parseSubmitTransactionRequest(data["idempotencyKey"], data);

    return { messageId, occurredAt, payloadHash: hasher.sha256(canonicalJson(json)), command };
}
