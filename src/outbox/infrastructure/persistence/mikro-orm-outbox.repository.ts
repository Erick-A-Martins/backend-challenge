import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import type { OutboxMessage } from "../../domain/outbox-message";
import { OutboxRepository, type ClaimParams } from "../../domain/outbox.repository";
import { toOutboxMessage, toOutboxMessageRecord } from "./outbox-message.mapper";
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

    override async claimDue(params: ClaimParams): Promise<OutboxMessage[]> {
        const em = this.em.fork();
        
        await em.getConnection().execute(
            `update outbox_messages
          set locked_until = cast(? as timestamptz), lock_token = ?
        where id in (
          select id from outbox_messages
           where published_at is null
             and next_attempt_at <= cast(? as timestamptz)
             and (locked_until is null or locked_until <= cast(? as timestamptz))
           order by next_attempt_at, id
           limit ?
           for update skip locked
        )`,
            [
                params.leaseUntil.toISOString(),
                params.leaseToken,
                params.now.toISOString(),
                params.now.toISOString(),
                params.limit,
            ],
        );

        const records = await em.find(
            OutboxMessageRecord,
            { lockToken: params.leaseToken },
            { orderBy: { nextAttemptAt: "asc", id: "asc" } },
        );
        return records.map(toOutboxMessage);
    }

    override async markPublished(message: OutboxMessage): Promise<boolean> {
        if (message.publishedAt === undefined || message.leaseToken === undefined) {
            throw new Error(`Outbox message ${message.id} must be published and leased before confirming`);
        }
        // A condição lock_token garante que só quem ainda detém o lease confirma.
        const affected = await this.em.fork().nativeUpdate(
            OutboxMessageRecord,
            { id: message.id, lockToken: message.leaseToken },
            { publishedAt: message.publishedAt, lockedUntil: null, lockToken: null, lastError: null },
        );
        return affected > 0;
    }

    override async release(message: OutboxMessage): Promise<boolean> {
        if (message.leaseToken === undefined) {
            throw new Error(`Outbox message ${message.id} has no lease to release`);
        }
        const affected = await this.em.fork().nativeUpdate(
            OutboxMessageRecord,
            { id: message.id, lockToken: message.leaseToken },
            {
                attempts: message.attempts,
                nextAttemptAt: message.nextAttemptAt,
                lastError: message.lastError ?? null,
                lockedUntil: null,
                lockToken: null,
            },
        );
        return affected > 0;
    }
}
