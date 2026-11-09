import type { InboxMessage } from "./inbox-message";

export abstract class InboxRepository {
    abstract find(consumerName: string, messageId: string): Promise<InboxMessage | null>;
    
    abstract insert(message: InboxMessage): Promise<void>;

    abstract markProcessed(message: InboxMessage): Promise<void>;
}
