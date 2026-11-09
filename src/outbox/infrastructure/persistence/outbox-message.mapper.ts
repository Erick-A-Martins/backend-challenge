import type { RequiredEntityData } from "@mikro-orm/core";
import { OutboxMessage } from "../../domain/outbox-message";
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
        lockedUntil: message.lockedUntil ?? null,
        lockToken: message.leaseToken ?? null,
    };
}

export function toOutboxMessage(record: OutboxMessageRecord): OutboxMessage {
    return OutboxMessage.rehydrate({
        id: record.id,
        aggregateId: record.aggregateId,
        eventType: record.eventType,
        payload: record.payload,
        occurredAt: record.occurredAt,
        attempts: record.attempts,
        nextAttemptAt: record.nextAttemptAt,
        publishedAt: record.publishedAt ?? undefined,
        lastError: record.lastError ?? undefined,
        lockedUntil: record.lockedUntil ?? undefined,
        leaseToken: record.lockToken ?? undefined,
    });
}
