import type { OutboxMessage } from "./outbox-message";

export interface ClaimParams {
    now: Date;
    limit: number;
    leaseUntil: Date;
    leaseToken: string;
}

export abstract class OutboxRepository {
    abstract append(messages: readonly OutboxMessage[]): Promise<void>;

    abstract claimDue(params: ClaimParams): Promise<OutboxMessage[]>;

    abstract markPublished(message: OutboxMessage): Promise<boolean>;

    abstract release(message: OutboxMessage): Promise<boolean>;
}
