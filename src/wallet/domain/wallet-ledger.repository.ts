import type { WalletLedgerEntry } from "./wallet-ledger-entry";

export abstract class WalletLedgerRepository {
    abstract append(entry: WalletLedgerEntry): Promise<void>;
}
