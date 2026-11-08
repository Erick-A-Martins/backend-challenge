import type { MoneyProps } from "../../shared/domain/money";
import type { Wallet } from "../domain/wallet";

export interface WalletView {
    id: string;
    playerId: string;
    balance: MoneyProps;
    version: number;
}

export function toWalletView(wallet: Wallet): WalletView {
    return {
        id: wallet.id,
        playerId: wallet.playerId,
        balance: wallet.balance.toJSON(),
        version: wallet.version,
    };
}
