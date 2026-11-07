import type { RequiredEntityData } from "@mikro-orm/core";
import type { Wallet } from "../../domain/wallet";
import type { WalletRecord } from "./wallet.record";

export function toWalletRecord(wallet: Wallet): RequiredEntityData<WalletRecord> {
    return {
        id: wallet.id,
        playerId: wallet.playerId,
        currency: wallet.currency,
        balance: wallet.balance.toString(),
        version: wallet.version,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
    };
}
