import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import type { OutboxMessage } from "../../domain/outbox-message";
import { OutboxRepository } from "../../domain/outbox.repository";
import { toOutboxMessageRecord } from "./outbox-message.mapper";
import { OutboxMessageRecord } from "./outbox-message.record";

@Injectable()
export class MikroOrmOutboxRepository extends OutboxRepository {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override async append(messages: readonly OutboxMessage[]): Promise<void> {
        for (const message of messages) {
            await this.em.insert(OutboxMessageRecord, toOutboxMessageRecord(message));
        }
    }
}
