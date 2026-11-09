import { Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { InboxDuplicateError } from "../../domain/errors/inbox-duplicate.error";
import type { InboxMessage } from "../../domain/inbox-message";
import { InboxRepository } from "../../domain/inbox.repository";
import { toInboxMessage, toInboxMessageRecord } from "./inbox-message.mapper";
import { InboxMessageRecord } from "./inbox-message.record";

@Injectable()
export class MikroOrmInboxRepository extends InboxRepository {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override async find(consumerName: string, messageId: string): Promise<InboxMessage | null> {
        const record = await this.em.findOne(InboxMessageRecord, { consumerName, messageId });
        return record ? toInboxMessage(record) : null;
    }

    override async insert(message: InboxMessage): Promise<void> {
        try {
            await this.em.insert(InboxMessageRecord, toInboxMessageRecord(message));
        } catch (error) {
            if (error instanceof UniqueConstraintViolationException) {
                throw new InboxDuplicateError(message.consumerName, message.messageId);
            }
            
            throw error;
        }
    }

    override async markProcessed(message: InboxMessage): Promise<void> {
        if (message.processedAt === undefined) {
            throw new Error(`Inbox message ${message.messageId} must be processed before persisting`);
        }
        await this.em.nativeUpdate(
            InboxMessageRecord,
            { consumerName: message.consumerName, messageId: message.messageId },
            { processedAt: message.processedAt },
        );
    }
}
