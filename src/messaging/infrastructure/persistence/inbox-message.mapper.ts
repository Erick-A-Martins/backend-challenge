import type { RequiredEntityData } from "@mikro-orm/core";
import { InboxMessage } from "../../domain/inbox-message";
import type { InboxMessageRecord } from "./inbox-message.record";

export function toInboxMessageRecord(message: InboxMessage): RequiredEntityData<InboxMessageRecord> {
    return {
        consumerName: message.consumerName,
        messageId: message.messageId,
        payloadHash: message.payloadHash,
        receivedAt: message.receivedAt,
        processedAt: message.processedAt ?? null,
    };
}

export function toInboxMessage(record: InboxMessageRecord): InboxMessage {
    return InboxMessage.rehydrate({
        consumerName: record.consumerName,
        messageId: record.messageId,
        payloadHash: record.payloadHash,
        receivedAt: record.receivedAt,
        processedAt: record.processedAt ?? undefined,
    });
}
