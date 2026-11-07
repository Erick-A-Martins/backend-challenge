import {Migration} from '@mikro-orm/migrations';

export class Migration20261107172018_create_core_schema extends Migration {

    override name = 'Migration20261107172018_create_core_schema';

    override up(): void | Promise<void> {
        // wallets
        this.addSql(`
            create table wallets
            (
                id         uuid primary key,
                player_id  uuid           not null,
                currency   varchar(3)     not null,
                balance    numeric(19, 2) not null,
                version    integer        not null default 1,
                created_at timestamptz    not null,
                updated_at timestamptz    not null,
                constraint wallets_player_currency_uq unique (player_id, currency),
                constraint wallets_id_currency_uq unique (id, currency),
                constraint wallets_balance_non_negative_ck check (balance >= 0),
                constraint wallets_version_positive_ck check (version >= 1),
                constraint wallets_currency_format_ck check (currency ~ '^[A-Z]{3}$'
            )
                )
        `);

        // wager_transactions
        this.addSql(`
            create table wager_transactions
            (
                id                                uuid primary key,
                provider_id                       text           not null,
                external_transaction_id           text           not null,
                idempotency_key                   text           not null,
                payload_hash                      text           not null,
                wallet_id                         uuid           not null,
                player_id                         uuid           not null,
                round_id                          text           not null,
                game_id                           text           not null,
                kind                              text           not null,
                amount                            numeric(19, 2) not null,
                currency                          varchar(3)     not null,
                reference_external_transaction_id text,
                reference_transaction_id          uuid,
                status                            text           not null default 'PENDING',
                failure_code                      text,
                processed_at                      timestamptz,
                reference_attempts                integer        not null default 0,
                next_attempt_at                   timestamptz,
                created_at                        timestamptz    not null,

                constraint wager_tx_provider_external_uq unique (provider_id, external_transaction_id),
                constraint wager_tx_provider_idempotency_uq unique (provider_id, idempotency_key),

                constraint wager_tx_wallet_fk
                    foreign key (wallet_id, currency) references wallets (id, currency),
                constraint wager_tx_reference_fk
                    foreign key (reference_transaction_id) references wager_transactions (id),

                constraint wager_tx_kind_ck
                    check (kind in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
                constraint wager_tx_status_ck
                    check (status in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')),
                constraint wager_tx_amount_non_negative_ck
                    check (amount >= 0),
                constraint wager_tx_currency_format_ck
                    check (currency ~ '^[A-Z]{3}$'),
                constraint wager_tx_attempts_ck            
                    check (reference_attempts >= 0),
                constraint wager_tx_reference_required_ck
                    check (kind not in ('REFUND','ROLLBACK') or reference_external_transaction_id is not null),
                constraint wager_tx_failure_code_ck
                    check ((status in ('REJECTED','FAILED')) = (failure_code is not null)),
                constraint wager_tx_processed_at_ck
                    check ((status = 'PROCESSED') = (processed_at is not null))
            )
        `);

        this.addSql(`
            create unique index wager_tx_one_reversal_per_reference_ux
                on wager_transactions (reference_transaction_id, kind)
                where status = 'PROCESSED'
                    and kind in ('REFUND', 'ROLLBACK')
                    and reference_transaction_id is not null
        `);

        this.addSql(`
            create index wager_tx_pending_reference_due_idx
                on wager_transactions (next_attempt_at)
                where status = 'PENDING_REFERENCE'
        `);

        this.addSql(`
            create index wager_tx_wallet_idx on wager_transactions (wallet_id)
        `);

      this.addSql(`
        create table wallet_ledger_entries
        (
            id             uuid primary key,
            wallet_id      uuid           not null,
            transaction_id uuid           not null,
            direction      text           not null,
            currency       varchar(3)     not null,
            amount         numeric(19, 2) not null,
            balance_before numeric(19, 2) not null,
            balance_after  numeric(19, 2) not null,
            created_at     timestamptz    not null,

            constraint ledger_wallet_fk
              foreign key (wallet_id, currency) references wallets (id, currency),
            constraint ledger_transaction_fk
              foreign key (transaction_id) references wager_transactions (id),

            constraint ledger_wallet_transaction_uq unique (wallet_id, transaction_id),
  
            constraint ledger_direction_ck check (direction in ('DEBIT', 'CREDIT')),
            constraint ledger_amount_positive_ck check (amount > 0),
            constraint ledger_balances_non_negative_ck
              check (balance_before >= 0 and balance_after >= 0),

            constraint ledger_arithmetic_ck
              check (balance_after = case direction
                                       when 'DEBIT' then balance_before - amount
                                       else balance_before + amount 
                                     end)
        )
      `);

      this.addSql(`
          create index ledger_wallet_cursor_idx on wallet_ledger_entries (wallet_id, created_at desc, id desc)
      `);

      this.addSql(`
          create function forbid_ledger_mutation() returns trigger
          language plpgsql as $$
          begin
             raise exception 'wallet_ledger_entries is append-only: % is not allowed', tg_op
                using errcode = 'restrict_violation';
          end;
          $$
      `);

      this.addSql(`
          create trigger wallet_ledger_entries_immutable
            before update or delete on wallet_ledger_entries
            for each row execute function forbid_ledger_mutation()
      `);
    }

    override down(): void | Promise<void> {
        this.addSql(`drop trigger if exists wallet_ledger_entries_immutable on wallet_ledger_entries`);
        this.addSql(`drop function if exists forbid_ledger_mutation()`);
        this.addSql(`drop table if exists wallet_ledger_entries`);
        this.addSql(`drop table if exists wager_transactions`);
        this.addSql(`drop table if exists wallets`);
    }

}
