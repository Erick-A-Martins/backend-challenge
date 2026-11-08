import type { OutboxMessage } from "./outbox-message";

export abstract class OutboxRepository {
    abstract append(messages: readonly OutboxMessage[]): Promise<void>;
}
