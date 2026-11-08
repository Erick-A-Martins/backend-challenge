import { canonicalJson } from "../../shared/domain/canonical-json";
import type { MoneyProps } from "../../shared/domain/money";
import type { WagerTransactionKind } from "./enums/wager-transaction-kind";

export interface PayloadFields {
    providerId: string;
    externalTransactionId: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
    referenceExternalTransactionId?: string;
}

/**
 * Subconjunto de negócio que entra no hash. A Idempotency-Key e metadados de transporte ficam
 * de fora. Os campos são listados um a um, então propriedades extras nunca vazam para o hash.
 */
export function canonicalPayload(fields: PayloadFields): string {
    return canonicalJson({
        providerId: fields.providerId,
        externalTransactionId: fields.externalTransactionId,
        playerId: fields.playerId,
        walletId: fields.walletId,
        roundId: fields.roundId,
        gameId: fields.gameId,
        kind: fields.kind,
        money: { amount: fields.money.amount, currency: fields.money.currency },
        referenceExternalTransactionId: fields.referenceExternalTransactionId,
    });
}
