import { Injectable } from "@nestjs/common";
import { Clock } from "../../shared/application/clock";
import { IdGenerator } from "../../shared/application/id-generator";
import { UnitOfWork } from "../../shared/application/unit-of-work";
import { Money, type MoneyProps } from "../../shared/domain/money";
import { InsufficientFundsError } from "../../shared/domain/errors/insufficient-funds.error";
import { WalletNotFoundError } from "../../wallet/domain/errors/wallet-not-found.error";
import { LedgerDirection } from "../../wallet/domain/enums/ledger-direction";
import type { Wallet } from "../../wallet/domain/wallet";
import type { WalletLedgerEntry } from "../../wallet/domain/wallet-ledger-entry";
import { WalletLedgerRepository } from "../../wallet/domain/wallet-ledger.repository";
import { WalletRepository } from "../../wallet/domain/wallet.repository";
import { FailureCode } from "../domain/enums/failure-code";
import { WagerTransaction } from "../domain/wager-transaction";
import { WagerTransactionKind } from "../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../domain/enums/wager-transaction-status";
import { WagerTransactionRepository } from "../domain/wager-transaction.repository";
import { ReferenceRetryPolicy } from "./reference-retry.policy";

export interface SubmitWagerTransactionCommand {
    providerId: string;
    externalTransactionId: string;
    idempotencyKey: string;
    payloadHash: string;
    playerId: string;
    walletId: string;
    roundId: string;
    gameId: string;
    kind: WagerTransactionKind;
    money: MoneyProps;
    referenceExternalTransactionId?: string;
}

export interface SubmitWagerTransactionResult {
    transactionId: string;
    status: WagerTransactionStatus;
    failureCode?: FailureCode;
    balance: MoneyProps;
}

@Injectable()
export class SubmitWagerTransactionUseCase {
    constructor(
        private readonly unitOfWork: UnitOfWork,
        private readonly wallets: WalletRepository,
        private readonly ledger: WalletLedgerRepository,
        private readonly transactions: WagerTransactionRepository,
        private readonly clock: Clock,
        private readonly ids: IdGenerator,
    ) {}

    async execute(command: SubmitWagerTransactionCommand): Promise<SubmitWagerTransactionResult> {
        const now = this.clock.now();
        const transaction = WagerTransaction.create({
            id: this.ids.next(),
            providerId: command.providerId,
            externalTransactionId: command.externalTransactionId,
            idempotencyKey: command.idempotencyKey,
            payloadHash: command.payloadHash,
            walletId: command.walletId,
            playerId: command.playerId,
            roundId: command.roundId,
            gameId: command.gameId,
            kind: command.kind,
            money: Money.from(command.money),
            referenceExternalTransactionId: command.referenceExternalTransactionId,
            createdAt: now,
        });

        return this.unitOfWork.run(async () => {
            // 1) Lock da wallet: serializa tudo que mexe nesta wallet. Wallets diferentes seguem em paralelo.
            const wallet = await this.wallets.findByIdForUpdate(command.walletId);
            if (!wallet) {
                throw new WalletNotFoundError(command.walletId);
            }

            // 2) Decide o destino da transação (muda o estado de `transaction` e, se for o caso, o de `wallet`).
            const entry = await this.process(wallet, transaction, now);

            // 3) Grava tudo na mesma transação SQL (ordem imposta pelas chaves estrangeiras).
            await this.transactions.insert(transaction);
            if (entry) {
                await this.wallets.update(wallet);
                await this.ledger.append(entry);
            }

            return {
                transactionId: transaction.id,
                status: transaction.status,
                failureCode: transaction.failureCode,
                balance: wallet.balance.toJSON(),
            };
        });
    }

    private async process(
        wallet: Wallet,
        tx: WagerTransaction,
        now: Date,
    ): Promise<WalletLedgerEntry | undefined> {
        if (wallet.playerId !== tx.playerId) {
            tx.reject(FailureCode.WalletPlayerMismatch);
            return undefined;
        }
        if (wallet.currency !== tx.money.currency) {
            tx.reject(FailureCode.CurrencyMismatch);
            return undefined;
        }

        let reference: WagerTransaction | undefined;
        if (tx.referenceExternalTransactionId !== undefined) {
            const found = await this.transactions.findByProviderAndExternalId(
                tx.providerId,
                tx.referenceExternalTransactionId,
            );

            if (found === null || found.status === WagerTransactionStatus.PendingReference) {
                tx.markPendingReference(ReferenceRetryPolicy.nextAttemptAt(now, tx.referenceAttempts + 1));
                return undefined;
            }

            const failure = tx.checkReference(found);
            if (failure !== undefined) {
                tx.reject(failure);
                return undefined;
            }

            if (tx.requiresReference() && (await this.transactions.hasProcessedReversalOf(found.id))) {
                tx.reject(FailureCode.AlreadyReversed);
                return undefined;
            }
            reference = found;
        }

        if (!tx.affectsBalance()) {
            tx.markProcessed(reference?.id, now);
            return undefined;
        }

        const direction = tx.ledgerDirectionFor(reference);
        const movement = { entryId: this.ids.next(), transactionId: tx.id, amount: tx.money, at: now };

        try {
            const entry = direction === LedgerDirection.Debit ? wallet.debit(movement) : wallet.credit(movement);
            tx.markProcessed(reference?.id, now);
            return entry;
        } catch (error) {
            if (error instanceof InsufficientFundsError) {
                tx.reject(
                    tx.kind === WagerTransactionKind.Rollback
                        ? FailureCode.ReversalWouldOverdraw
                        : FailureCode.InsufficientFunds,
                );
                return undefined;
            }
            throw error;
        }
    }
}
