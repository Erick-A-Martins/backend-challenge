import {Migration} from '@mikro-orm/migrations';

export class Migration20261108231031_create_inbox extends Migration {

    override name = 'Migration20261108231031_create_inbox';

    override up(): void | Promise<void> {
        this.addSql(`
            create table inbox_messages
            (
                consumer_name text        not null,
                message_id    text        not null,
                payload_hash  text        not null,
                received_at   timestamptz not null,
                processed_at  timestamptz,
                primary key (consumer_name, message_id)
            )
        `);
        this.addSql(`
            create index inbox_unprocessed_idx
                on inbox_messages (received_at) where processed_at is null
        `);
    }

    override down(): void | Promise<void> {
        this.addSql(`drop index if exists inbox_unprocessed_idx`);
        this.addSql(`drop table if exists inbox_messages`);
    }

}
