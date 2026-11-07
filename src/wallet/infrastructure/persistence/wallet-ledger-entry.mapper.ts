import type { RequiredEntityData } from "@mikro-orm/core";
import type { WalletLedgerEntry } from "../../domain/wallet-ledger-entry";
import type { WalletLedgerEntryRecord } from "./wallet-ledger-entry.record";

export function toLedgerEntryRecord(entry: WalletLedgerEntry): RequiredEntityData<WalletLedgerEntryRecord> {
    return {
        id: entry.id,
        walletId: entry.walletId,
        transactionId: entry.transactionId,
        direction: entry.direction,
        currency: entry.money.currency,
        amount: entry.money.toString(),
        balanceBefore: entry.balanceBefore.toString(),
        balanceAfter: entry.balanceAfter.toString(),
        createdAt: entry.createdAt,
    };
}
