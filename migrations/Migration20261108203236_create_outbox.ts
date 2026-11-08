import { Migration } from '@mikro-orm/migrations';

export class Migration20261108203236_create_outbox extends Migration {

  override name = 'Migration20261108203236_create_outbox';

  override up(): void | Promise<void> {
    this.addSql(`
      create table outbox_messages (
        id              uuid        primary key,
        aggregate_id    uuid        not null,
        event_type      text        not null,
        payload         jsonb       not null,
        occurred_at     timestamptz not null,
        attempts        integer     not null default 0,
        next_attempt_at timestamptz not null,
        published_at    timestamptz,
        last_error      text,
        constraint outbox_attempts_ck check (attempts >= 0)
      )
    `);

    this.addSql(`
      create index outbox_pending_due_idx
        on outbox_messages (next_attempt_at, id)
        where published_at is null
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists outbox_pending_due_idx`);
    this.addSql(`drop table if exists outbox_messages`);
  }

}
