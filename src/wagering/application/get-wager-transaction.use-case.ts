import { Injectable } from "@nestjs/common";
import { TransactionNotFoundError } from "../domain/errors/transaction-not-found.error";
import { WagerTransactionRepository } from "../domain/wager-transaction.repository";
import { toWagerTransactionView, type WagerTransactionView } from "./wager-transaction.view";

@Injectable()
export class GetWagerTransactionUseCase {
    constructor(private readonly transactions: WagerTransactionRepository) {}

    async byId(transactionId: string): Promise<WagerTransactionView> {
        const tx = await this.transactions.findById(transactionId);
        if (!tx) {
            throw new TransactionNotFoundError(transactionId);
        }
        return toWagerTransactionView(tx);
    }

    async byProviderAndExternalId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransactionView> {
        const tx = await this.transactions.findByProviderAndExternalId(providerId, externalTransactionId);
        if (!tx) {
            throw new TransactionNotFoundError(`${providerId}/${externalTransactionId}`);
        }
        return toWagerTransactionView(tx);
    }
}
