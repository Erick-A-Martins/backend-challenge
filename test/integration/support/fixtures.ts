import type { MikroORM } from "@mikro-orm/postgresql";
import { Clock } from "../../../src/shared/application/clock";
import { MikroOrmUnitOfWork } from "../../../src/shared/infrastructure/database/mikro-orm-unit-of-work";
import { UuidV7IdGenerator } from "../../../src/shared/infrastructure/uuid-v7-id-generator";
import { SubmitWagerTransactionUseCase, type SubmitWagerTransactionCommand } from "../../../src/wagering/application/submit-wager-transaction.use-case";
import type { WagerTransactionKind } from "../../../src/wagering/domain/enums/wager-transaction-kind";
import { MikroOrmWagerTransactionRepository } from "../../../src/wagering/infrastructure/persistence/mikro-orm-wager-transaction.repository";
import { CreateWalletUseCase } from "../../../src/wallet/application/create-wallet.use-case";
import type { WalletView } from "../../../src/wallet/application/wallet.view";
import type { WalletLedgerRepository } from "../../../src/wallet/domain/wallet-ledger.repository";
import { MikroOrmWalletLedgerRepository } from "../../../src/wallet/infrastructure/persistence/mikro-orm-wallet-ledger.repository";
import { MikroOrmWalletRepository } from "../../../src/wallet/infrastructure/persistence/mikro-orm-wallet.repository";
import { query } from "./test-database";
import { Sha256Hasher } from "../../../src/shared/infrastructure/sha256-hasher";
import { expect } from "bun:test";
import { MikroOrmOutboxRepository } from "../../../src/outbox/infrastructure/persistence/mikro-orm-outbox.repository";
import { OutboxRepository } from "../../../src/outbox/domain/outbox.repository";

export const AT = new Date("2026-01-01T12:00:00.000Z");

export class FixedClock extends Clock {
    override now(): Date {
        return AT;
    }
}

export function buildUseCases(orm: MikroORM, ledger?: WalletLedgerRepository, outbox?: OutboxRepository) {
    const unitOfWork = new MikroOrmUnitOfWork(orm.em);
    const wallets = new MikroOrmWalletRepository(orm.em);
    const transactions = new MikroOrmWagerTransactionRepository(orm.em);
    const ledgerRepository = ledger ?? new MikroOrmWalletLedgerRepository(orm.em);
    const outboxRepository = outbox ?? new MikroOrmOutboxRepository(orm.em);
    const clock = new FixedClock();
    const ids = new UuidV7IdGenerator();

    return {
        createWallet: new CreateWalletUseCase(unitOfWork, wallets, transactions, ledgerRepository, outboxRepository, clock, ids),
        submit: new SubmitWagerTransactionUseCase(unitOfWork, wallets, ledgerRepository, transactions, outboxRepository, new Sha256Hasher(), clock, ids),
    };
}

interface CommandOptions {
    id?: string;
    ref?: string;
    roundId?: string;
    currency?: string;
    playerId?: string;
    correlationId?: string;
}

let sequence = 0;

export function cmd(
    wallet: WalletView,
    kind: WagerTransactionKind,
    amount: string,
    options: CommandOptions = {},
): SubmitWagerTransactionCommand {
    const providerId = "provider-a";
    sequence += 1;
    const external = options.id ?? `ext-${sequence}`;

    return {
        providerId,
        externalTransactionId: external,
        idempotencyKey: `${providerId}:${external}`,
        playerId: options.playerId ?? wallet.playerId,
        walletId: wallet.id,
        roundId: options.roundId ?? "round-1",
        gameId: "game-1",
        kind,
        money: { amount, currency: options.currency ?? wallet.balance.currency },
        ...(options.ref !== undefined ? { referenceExternalTransactionId: options.ref } : {}),
        ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
    };
}

export const walletState = async (orm: MikroORM, walletId: string) =>
    (await query<{ balance: string; version: number }>(orm, "select balance, version from wallets where id = ?", [walletId]))[0];

export const ledgerTotal = async (orm: MikroORM, walletId: string) =>
    (
        await query<{ total: string }>(
            orm,
            `select cast(coalesce(sum(case when direction = ? then amount else -amount end), 0) as numeric(19,2)) as total
         from wallet_ledger_entries where wallet_id = ?`,
            ["CREDIT", walletId],
        )
    )[0]?.total;

export const ledgerCount = async (orm: MikroORM, walletId: string, direction?: "CREDIT" | "DEBIT") => {
    const rows = direction
        ? await query<{ n: number }>(orm, "select count(*)::int as n from wallet_ledger_entries where wallet_id = ? and direction = ?", [walletId, direction])
        : await query<{ n: number }>(orm, "select count(*)::int as n from wallet_ledger_entries where wallet_id = ?", [walletId]);
    return rows[0]?.n;
};

export const transactionRow = async (orm: MikroORM, externalTransactionId: string) =>
    (
        await query<{ status: string; failure_code: string | null; reference_attempts: number }>(
            orm,
            "select status, failure_code, reference_attempts from wager_transactions where provider_id = ? and external_transaction_id = ?",
            ["provider-a", externalTransactionId],
        )
    )[0];

export const rowCount = async (orm: MikroORM, table: "wallets" | "wager_transactions" | "wallet_ledger_entries" | "outbox_messages") =>
    (await query<{ n: number }>(orm, `select count(*)::int as n from ${table}`))[0]?.n;

export const expectConsistent = async (orm: MikroORM, walletId: string, balance: string) => {
    expect((await walletState(orm, walletId))?.balance).toBe(balance);
    expect(await ledgerTotal(orm, walletId)).toBe(balance);
};
