import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity({ tableName: "wallet_ledger_entries" })
export class WalletLedgerEntryRecord {
    @PrimaryKey({ type: "string", columnType: "uuid" })
    id!: string;

    @Property({ type: "string", columnType: "uuid" })
    walletId!: string;

    @Property({ type: "string", columnType: "uuid" })
    transactionId!: string;

    @Property({ type: "string", columnType: "text" })
    direction!: string;

    @Property({ type: "string", columnType: "varchar(3)" })
    currency!: string;

    @Property({ type: "string", columnType: "numeric(19,2)" })
    amount!: string;

    @Property({ type: "string", columnType: "numeric(19,2)" })
    balanceBefore!: string;

    @Property({ type: "string", columnType: "numeric(19,2)" })
    balanceAfter!: string;

    @Property({ type: "Date", columnType: "timestamptz" })
    createdAt!: Date;
}
