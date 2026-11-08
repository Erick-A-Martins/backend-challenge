import "reflect-metadata";
import { defineConfig } from "@mikro-orm/postgresql";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";
import { WalletRecord } from "../../../wallet/infrastructure/persistence/wallet.record";
import { WagerTransactionRecord } from "../../../wagering/infrastructure/persistence/wager-transaction.record";
import { WalletLedgerEntryRecord } from "../../../wallet/infrastructure/persistence/wallet-ledger-entry.record";
import { OutboxMessageRecord } from "../../../outbox/infrastructure/persistence/outbox-message.record";

export default defineConfig({
    clientUrl: process.env.DATABASE_URL,
    metadataProvider: ReflectMetadataProvider,
    entities: [WalletRecord, WagerTransactionRecord, WalletLedgerEntryRecord, OutboxMessageRecord],
    extensions: [Migrator],
    migrations: {
        path: "./migrations",
        snapshot: false,
    },
});
