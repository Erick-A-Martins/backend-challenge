import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity({ tableName: "wallets" })
export class WalletRecord {
    @PrimaryKey({ type: "string", columnType: "uuid" })
    id!: string;

    @Property({ type: "string", columnType: "uuid" })
    playerId!: string;

    @Property({ type: "string", columnType: "varchar(3)" })
    currency!: string;

    @Property({ type: "string", columnType: "numeric(19,2)" })
    balance!: string;

    @Property({ type: "integer" })
    version!: number;

    @Property({ type: "Date", columnType: "timestamptz" })
    createdAt!: Date;

    @Property({ type: "Date", columnType: "timestamptz" })
    updatedAt!: Date;
}
