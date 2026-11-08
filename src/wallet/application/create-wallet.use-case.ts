import { Injectable } from "@nestjs/common";
import { Clock } from "../../shared/application/clock";
import { IdGenerator } from "../../shared/application/id-generator";
import { UnitOfWork } from "../../shared/application/unit-of-work";
import { Money, type MoneyProps } from "../../shared/domain/money";
import { WagerTransaction } from "../../wagering/domain/wager-transaction";
import { WagerTransactionRepository } from "../../wagering/domain/wager-transaction.repository";
import { LedgerDirection } from "../domain/enums/ledger-direction";
import { Wallet } from "../domain/wallet";
import { WalletLedgerEntry } from "../domain/wallet-ledger-entry";
import { WalletLedgerRepository } from "../domain/wallet-ledger.repository";
import { WalletRepository } from "../domain/wallet.repository";
import { toWalletView, type WalletView } from "./wallet.view";

export interface CreateWalletCommand {
    playerId: string;
    initialBalance: MoneyProps;
}

@Injectable()
export class CreateWalletUseCase {
    constructor(
        private readonly unitOfWork: UnitOfWork,
        private readonly wallets: WalletRepository,
        private readonly transactions: WagerTransactionRepository,
        private readonly ledger: WalletLedgerRepository,
        private readonly clock: Clock,
        private readonly ids: IdGenerator,
    ) {}

    async execute(command: CreateWalletCommand): Promise<WalletView> {
        const initialBalance = Money.from(command.initialBalance);
        const now = this.clock.now();

        const wallet = Wallet.open({
            id: this.ids.next(),
            playerId: command.playerId,
            initialBalance,
            now,
        });

        await this.unitOfWork.run(async () => {
            await this.wallets.insert(wallet);

            if (initialBalance.isPositive()) {
                const opening = WagerTransaction.createOpening({
                    id: this.ids.next(),
                    walletId: wallet.id,
                    playerId: wallet.playerId,
                    money: initialBalance,
                    createdAt: now,
                });
                opening.markProcessed(undefined, now);

                const entry = WalletLedgerEntry.create({
                    id: this.ids.next(),
                    walletId: wallet.id,
                    transactionId: opening.id,
                    direction: LedgerDirection.Credit,
                    money: initialBalance,
                    balanceBefore: Money.zero(wallet.currency),
                    balanceAfter: wallet.balance,
                    createdAt: now,
                });

                await this.transactions.insert(opening);
                await this.ledger.append(entry);
            }
        });

        return toWalletView(wallet);
    }
}
