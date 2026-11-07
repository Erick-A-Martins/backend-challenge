import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity({ tableName: "wager_transactions" })
export class WagerTransactionRecord {
    @PrimaryKey({ type: "string", columnType: "uuid" })
    id!: string;

    @Property({ type: "string", columnType: "text" })
    providerId!: string;

    @Property({ type: "string", columnType: "text" })
    externalTransactionId!: string;

    @Property({ type: "string", columnType: "text" })
    idempotencyKey!: string;

    @Property({ type: "string", columnType: "text" })
    payloadHash!: string;

    @Property({ type: "string", columnType: "uuid" })
    walletId!: string;

    @Property({ type: "string", columnType: "uuid" })
    playerId!: string;

    @Property({ type: "string", columnType: "text" })
    roundId!: string;

    @Property({ type: "string", columnType: "text" })
    gameId!: string;

    @Property({ type: "string", columnType: "text" })
    kind!: string;

    @Property({ type: "string", columnType: "numeric(19,2)" })
    amount!: string;

    @Property({ type: "string", columnType: "varchar(3)" })
    currency!: string;

    @Property({ type: "string", columnType: "text", nullable: true })
    referenceExternalTransactionId?: string | null;

    @Property({ type: "string", columnType: "uuid", nullable: true })
    referenceTransactionId?: string | null;

    @Property({ type: "string", columnType: "text" })
    status!: string;

    @Property({ type: "string", columnType: "text", nullable: true })
    failureCode?: string | null;

    @Property({ type: "Date", columnType: "timestamptz", nullable: true })
    processedAt?: Date | null;

    @Property({ type: "integer" })
    referenceAttempts!: number;

    @Property({ type: "Date", columnType: "timestamptz", nullable: true })
    nextAttemptAt?: Date | null;

    @Property({ type: "Date", columnType: "timestamptz" })
    createdAt!: Date;
}
