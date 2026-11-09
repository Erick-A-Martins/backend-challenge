import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/legacy";

@Entity({ tableName: "inbox_messages" })
export class InboxMessageRecord {
    @PrimaryKey({ type: "string", columnType: "text" })
    consumerName!: string;

    @PrimaryKey({ type: "string", columnType: "text" })
    messageId!: string;

    @Property({ type: "string", columnType: "text" })
    payloadHash!: string;

    @Property({ type: "Date", columnType: "timestamptz" })
    receivedAt!: Date;

    @Property({ type: "Date", columnType: "timestamptz", nullable: true })
    processedAt?: Date | null;
}
