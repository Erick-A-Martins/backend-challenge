import type { RequiredEntityData } from "@mikro-orm/core";
import { Wallet } from "../../domain/wallet";
import { WalletRecord } from "./wallet.record";
import { Money } from "../../../shared/domain/money";

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

export function toWallet(record: WalletRecord): Wallet {
    return Wallet.rehydrate({
        id: record.id,
        playerId: record.playerId,
        currency: record.currency,
        balance: Money.from({ amount: record.balance, currency: record.currency }),
        version: record.version,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    });
}
