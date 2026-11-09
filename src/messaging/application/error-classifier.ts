import { InvalidMoneyError } from "../../shared/domain/errors/invalid-money.error";
import { InvalidRequestError } from "../../shared/domain/errors/invalid-request.error";
import { DuplicateTransactionError } from "../../wagering/domain/errors/duplicate-transaction.error";
import { IdempotencyConflictError } from "../../wagering/domain/errors/idempotency-conflict.error";
import { InvalidTransactionError } from "../../wagering/domain/errors/invalid-transaction.error";
import { WalletNotFoundError } from "../../wallet/domain/errors/wallet-not-found.error";
import { InboxPayloadMismatchError } from "../domain/errors/inbox-payload-mismatch.error";

/**
 * business:  resultado terminal, a mensagem recebe ack.
 * permanent: reenviar não adianta, a mensagem vai para a DLQ com o motivo.
 * transient: tentamos de novo com backoff; esgotado o limite, o SQS leva para a DLQ.
 */
export type ErrorClass = "business" | "permanent" | "transient";

export function classifyError(error: unknown): ErrorClass {
    if (error instanceof IdempotencyConflictError || error instanceof DuplicateTransactionError) {
        return "business";
    }
    if (
        error instanceof InvalidRequestError ||
        error instanceof InvalidMoneyError ||
        error instanceof InvalidTransactionError ||
        error instanceof WalletNotFoundError ||
        error instanceof InboxPayloadMismatchError
    ) {
        return "permanent";
    }
    
    return "transient";
}
