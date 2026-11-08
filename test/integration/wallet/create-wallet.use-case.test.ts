import {afterAll, beforeAll, beforeEach, describe, expect, test} from "bun:test";
import type {MikroORM} from "@mikro-orm/postgresql";
import {InvalidMoneyError} from "../../../src/shared/domain/errors/invalid-money.error";
import {WalletAlreadyExistsError} from "../../../src/wallet/domain/errors/wallet-already-exists.error";
import {WalletLedgerRepository} from "../../../src/wallet/domain/wallet-ledger.repository";
import {createTestOrm, query, truncateAll} from "../support/test-database";
import {buildUseCases} from "../support/fixtures";

const AT = new Date("2026-01-01T12:00:00.000Z");
const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

class FailingLedgerRepository extends WalletLedgerRepository {
    override async append(): Promise<void> {
        throw new Error("ledger boom");
    }
}

interface WalletRow { balance: string; version: number; currency: string }
interface TxRow { kind: string; status: string; provider_id: string; external_transaction_id: string; amount: string }
interface LedgerRow { direction: string; amount: string; balance_before: string; balance_after: string; created_at: Date }

let orm: MikroORM;

const build = (ledger?: WalletLedgerRepository) => buildUseCases(orm, ledger).createWallet;

const command = (amount: string, currency = "BRL", playerId = PLAYER) => ({
    playerId,
    initialBalance: { amount, currency },
});

const count = async (table: string) =>
    (await query<{ n: number }>(orm, `select count(*)::int as n from ${table}`))[0]?.n;

const ledgerTotal = async (walletId: string) =>
    (
        await query<{ total: string }>(
            orm,
            `select cast(coalesce(sum(case when direction = ? then amount else -amount end), 0) as numeric(19,2)) as total
             from wallet_ledger_entries where wallet_id = ?`,
            ['CREDIT', walletId],
        )
    )[0]?.total;

beforeAll(async () => {
    orm = await createTestOrm();
});

beforeEach(async () => {
    await truncateAll(orm);
});

afterAll(async () => {
    await orm.close();
});

describe("CreateWalletUseCase (PostgreSQL real)", () => {
    test("cria wallet, OPENING processada e lançamento de abertura", async () => {
        const result = await build().execute(command("1000.00"));

        expect(result.balance).toEqual({ amount: "1000.00", currency: "BRL" });
        expect(result.version).toBe(1);

        const wallets = await query<WalletRow>(orm, 'select * from wallets where id = ?', [result.id]);
        expect(wallets).toHaveLength(1);
        expect(wallets[0]).toMatchObject({ balance: "1000.00", version: 1, currency: "BRL" });
        const [walletInstant] = await query<{ same: boolean }>(
            orm,
            'select created_at = cast(? as timestamptz) as same from wallets where id = ?',
            [AT.toISOString(), result.id],
        );
        expect(walletInstant?.same).toBe(true);

        const txs = await query<TxRow>(orm, 'select * from wager_transactions where wallet_id = ?', [result.id]);
        expect(txs).toHaveLength(1);
        expect(txs[0]).toMatchObject({
            kind: "OPENING",
            status: "PROCESSED",
            provider_id: "system",
            external_transaction_id: result.id,
            amount: "1000.00",
        });
        const [txInstant] = await query<{ same: boolean }>(
            orm,
            'select processed_at = cast(? as timestamptz) as same from wager_transactions where wallet_id = ?',
            [AT.toISOString(), result.id],
        );
        expect(txInstant?.same).toBe(true);

        const entries = await query<LedgerRow>(orm, 'select * from wallet_ledger_entries where wallet_id = ?', [result.id]);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            direction: "CREDIT",
            amount: "1000.00",
            balance_before: "0.00",
            balance_after: "1000.00",
        });

        expect(await ledgerTotal(result.id)).toBe("1000.00");
    });

    test("saldo inicial zero cria só a wallet (sem OPENING nem lançamento)", async () => {
        const result = await build().execute(command("0.00"));

        expect(await count("wallets")).toBe(1);
        expect(await count("wager_transactions")).toBe(0);
        expect(await count("wallet_ledger_entries")).toBe(0);
        expect(await ledgerTotal(result.id)).toBe("0.00");
    });

    test("wallet duplicada (mesmo player e moeda) é conflito e não deixa lixo", async () => {
        await build().execute(command("100.00"));

        await expect(build().execute(command("500.00"))).rejects.toThrow(WalletAlreadyExistsError);

        expect(await count("wallets")).toBe(1);
        expect(await count("wager_transactions")).toBe(1);
        expect(await count("wallet_ledger_entries")).toBe(1);
    });

    test("mesmo player pode ter wallets em moedas diferentes", async () => {
        await build().execute(command("100.00", "BRL"));
        await build().execute(command("100.00", "USD"));
        expect(await count("wallets")).toBe(2);
    });

    test("ATOMICIDADE: falha no ledger desfaz wallet e OPENING", async () => {
        await expect(build(new FailingLedgerRepository()).execute(command("1000.00"))).rejects.toThrow("ledger boom");

        expect(await count("wallets")).toBe(0);
        expect(await count("wager_transactions")).toBe(0);
        expect(await count("wallet_ledger_entries")).toBe(0);
    });

    test("valor invalido é rejeitado antes de tocar o banco", async () => {
        await expect(build().execute(command("-1.00"))).rejects.toThrow(InvalidMoneyError);
        await expect(build().execute(command("1.234"))).rejects.toThrow(InvalidMoneyError);
        expect(await count("wallets")).toBe(0);
    });
});
