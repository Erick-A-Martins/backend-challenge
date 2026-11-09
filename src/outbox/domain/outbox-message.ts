import type { IntegrationEvent } from "../../shared/domain/integration-event";
import { OutboxMessageStateError } from "./errors/outbox-message-state.error";

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;
const MAX_ERROR_LENGTH = 500;

export interface OutboxMessageState {
    id: string;
    aggregateId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
    occurredAt: Date;
    attempts: number;
    nextAttemptAt: Date;
    publishedAt?: Date;
    lastError?: string;
    lockedUntil?: Date;
    leaseToken?: string;
}

export class OutboxMessage {
    private constructor(
        public readonly id: string,
        public readonly aggregateId: string,
        public readonly eventType: string,
        public readonly payload: Readonly<Record<string, unknown>>,
        public readonly occurredAt: Date,
        private _attempts: number,
        private _nextAttemptAt: Date,
        private _publishedAt: Date | undefined,
        private _lastError: string | undefined,
        public readonly lockedUntil: Date | undefined,
        public readonly leaseToken: string | undefined,
    ) {}
    
    static enqueue(event: IntegrationEvent<unknown>): OutboxMessage {
        return new OutboxMessage(
            event.eventId,
            event.aggregateId,
            event.eventType,
            event.toJSON() as unknown as Record<string, unknown>,
            event.occurredAt,
            0,
            event.occurredAt,
            undefined,
            undefined,
            undefined,
            undefined,
        );
    }

    /** Reconstrução a partir da persistência. Não revalida. */
    static rehydrate(state: OutboxMessageState): OutboxMessage {
        return new OutboxMessage(
            state.id,
            state.aggregateId,
            state.eventType,
            state.payload,
            state.occurredAt,
            state.attempts,
            state.nextAttemptAt,
            state.publishedAt,
            state.lastError,
            state.lockedUntil,
            state.leaseToken,
        );
    }

    get attempts(): number {
        return this._attempts;
    }
    get nextAttemptAt(): Date {
        return this._nextAttemptAt;
    }
    get publishedAt(): Date | undefined {
        return this._publishedAt;
    }
    get lastError(): string | undefined {
        return this._lastError;
    }

    isPending(): boolean {
        return this._publishedAt === undefined;
    }

    isDue(now: Date): boolean {
        return this.isPending() && this._nextAttemptAt.getTime() <= now.getTime();
    }

    markPublished(at: Date): void {
        this.assertPending("mark as published");
        this._publishedAt = at;
    }
    
    scheduleRetry(now: Date, error?: string): void {
        this.assertPending("schedule a retry for");
        this._attempts += 1;
        const delay = Math.min(BASE_DELAY_MS * 2 ** (this._attempts - 1), MAX_DELAY_MS);
        this._nextAttemptAt = new Date(now.getTime() + delay);
        this._lastError = error?.slice(0, MAX_ERROR_LENGTH);
    }

    private assertPending(operation: string): void {
        if (!this.isPending()) {
            throw new OutboxMessageStateError(operation, this.id);
        }
    }
}
