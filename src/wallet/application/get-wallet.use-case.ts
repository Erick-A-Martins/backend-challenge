import { Injectable } from "@nestjs/common";
import { WalletNotFoundError } from "../domain/errors/wallet-not-found.error";
import { WalletRepository } from "../domain/wallet.repository";
import { toWalletView, type WalletView } from "./wallet.view";

@Injectable()
export class GetWalletUseCase {
    constructor(private readonly wallets: WalletRepository) {}

    async execute(walletId: string): Promise<WalletView> {
        const wallet = await this.wallets.findById(walletId);
        if (!wallet) {
            throw new WalletNotFoundError(walletId);
        }
        return toWalletView(wallet);
    }
}
