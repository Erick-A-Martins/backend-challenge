import type { RequiredEntityData } from "@mikro-orm/core";
import type { OutboxMessage } from "../../domain/outbox-message";
import type { OutboxMessageRecord } from "./outbox-message.record";

export function toOutboxMessageRecord(message: OutboxMessage): RequiredEntityData<OutboxMessageRecord> {
    return {
        id: message.id,
        aggregateId: message.aggregateId,
        eventType: message.eventType,
        payload: message.payload as Record<string, unknown>,
        occurredAt: message.occurredAt,
        attempts: message.attempts,
        nextAttemptAt: message.nextAttemptAt,
        publishedAt: message.publishedAt ?? null,
        lastError: message.lastError ?? null,
    };
}
