import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity({ tableName: "outbox_messages" })
export class OutboxMessageRecord {
    @PrimaryKey({ type: "string", columnType: "uuid" })
    id!: string;

    @Property({ type: "string", columnType: "uuid" })
    aggregateId!: string;

    @Property({ type: "string", columnType: "text" })
    eventType!: string;

    @Property({ type: "json", columnType: "jsonb" })
    payload!: Record<string, unknown>;

    @Property({ type: "Date", columnType: "timestamptz" })
    occurredAt!: Date;

    @Property({ type: "integer" })
    attempts!: number;

    @Property({ type: "Date", columnType: "timestamptz" })
    nextAttemptAt!: Date;

    @Property({ type: "Date", columnType: "timestamptz", nullable: true })
    publishedAt?: Date | null;

    @Property({ type: "string", columnType: "text", nullable: true })
    lastError?: string | null;

    @Property({ type: "Date", columnType: "timestamptz", nullable: true })
    lockedUntil?: Date | null;

    @Property({ type: "string", columnType: "text", nullable: true })
    lockToken?: string | null;
}
