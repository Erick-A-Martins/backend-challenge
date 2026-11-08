import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { InvalidTransactionError } from "../../../src/wagering/domain/errors/invalid-transaction.error";
import { FailureCode } from "../../../src/wagering/domain/enums/failure-code";
import { WagerTransactionKind as Kind } from "../../../src/wagering/domain/enums/wager-transaction-kind";
import { WagerTransactionStatus as Status } from "../../../src/wagering/domain/enums/wager-transaction-status";
import { WalletNotFoundError } from "../../../src/wallet/domain/errors/wallet-not-found.error";
import { WalletLedgerRepository } from "../../../src/wallet/domain/wallet-ledger.repository";
import {
    AT, buildUseCases, cmd, ledgerCount, ledgerTotal, rowCount, transactionRow, walletState,
} from "../support/fixtures";
import { createTestOrm, query, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

class FailingLedgerRepository extends WalletLedgerRepository {
    override async append(): Promise<void> {
        throw new Error("ledger boom");
    }
}

let orm: MikroORM;
let useCases: ReturnType<typeof buildUseCases>;

const newWallet = (amount = "100.00", currency = "BRL", playerId = PLAYER) =>
    useCases.createWallet.execute({ playerId, initialBalance: { amount, currency } });

const expectConsistent = async (walletId: string, balance: string) => {
    expect((await walletState(orm, walletId))?.balance).toBe(balance);
    expect(await ledgerTotal(orm, walletId)).toBe(balance);
};

beforeAll(async () => {
    orm = await createTestOrm();
    useCases = buildUseCases(orm);
});
beforeEach(async () => {
    await truncateAll(orm);
});
afterAll(async () => {
    await orm.close();
});

describe("BET", () => {
    test("debita o saldo e gera um lançamento DEBIT", async () => {
        const w = await newWallet("100.00");
        const result = await useCases.submit.execute(cmd(w, Kind.Bet, "30.00"));

        expect(result.status).toBe(Status.Processed);
        expect(result.balance).toEqual({ amount: "70.00", currency: "BRL" });
        expect((await walletState(orm, w.id))?.version).toBe(2);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        await expectConsistent(w.id, "70.00");
    });

    test("saldo insuficiente: REJECTED, sem alterar saldo nem ledger, mas auditável", async () => {
        const w = await newWallet("20.00");
        const command = cmd(w, Kind.Bet, "80.00");
        const result = await useCases.submit.execute(command);

        expect(result.status).toBe(Status.Rejected);
        expect(result.failureCode).toBe(FailureCode.InsufficientFunds);
        expect(result.balance.amount).toBe("20.00");
        expect((await walletState(orm, w.id))?.version).toBe(1);
        expect(await ledgerCount(orm, w.id)).toBe(1); // só a abertura
        expect(await transactionRow(orm, command.externalTransactionId)).toMatchObject({
            status: "REJECTED",
            failure_code: "INSUFFICIENT_FUNDS",
        });
        await expectConsistent(w.id, "20.00");
    });
});

describe("WIN e LOSS", () => {
    test("WIN referenciando a BET credita", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Win, "50.00", { ref: "bet-1" }));

        expect(result.status).toBe(Status.Processed);
        await expectConsistent(w.id, "120.00");
    });

    test("WIN sem referência credita", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Win, "50.00"));
        await expectConsistent(w.id, "150.00");
    });

    test("WIN de outra rodada: REFERENCE_MISMATCH", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1", roundId: "round-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Win, "50.00", { ref: "bet-1", roundId: "round-2" }));

        expect(result.failureCode).toBe(FailureCode.ReferenceMismatch);
        await expectConsistent(w.id, "70.00");
    });

    test("LOSS não mexe em saldo, versão nem ledger", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Loss, "30.00", { ref: "bet-1" }));

        expect(result.status).toBe(Status.Processed);
        expect((await walletState(orm, w.id))?.version).toBe(2); // só a BET mudou o saldo
        expect(await ledgerCount(orm, w.id)).toBe(2); // abertura + BET
        await expectConsistent(w.id, "70.00");
    });
});

describe("REFUND", () => {
    test("devolve o valor da BET", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Refund, "30.00", { ref: "bet-1" }));

        expect(result.status).toBe(Status.Processed);
        await expectConsistent(w.id, "100.00");
    });

    test("segundo REFUND da mesma BET: ALREADY_REVERSED", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        await useCases.submit.execute(cmd(w, Kind.Refund, "30.00", { ref: "bet-1" }));
        const second = await useCases.submit.execute(cmd(w, Kind.Refund, "30.00", { ref: "bet-1" }));

        expect(second.failureCode).toBe(FailureCode.AlreadyReversed);
        await expectConsistent(w.id, "100.00");
    });

    test("valor diferente da referência: AMOUNT_MISMATCH", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Refund, "10.00", { ref: "bet-1" }));

        expect(result.failureCode).toBe(FailureCode.AmountMismatch);
        await expectConsistent(w.id, "70.00");
    });

    test("REFUND só referencia BET: INVALID_REFERENCE_KIND", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Win, "50.00", { id: "win-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Refund, "50.00", { ref: "win-1" }));

        expect(result.failureCode).toBe(FailureCode.InvalidReferenceKind);
        await expectConsistent(w.id, "150.00");
    });

    test("referência rejeitada: REFERENCE_NOT_PROCESSED", async () => {
        const w = await newWallet("20.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "80.00", { id: "bet-x" })); // rejeitada
        const result = await useCases.submit.execute(cmd(w, Kind.Refund, "80.00", { ref: "bet-x" }));

        expect(result.failureCode).toBe(FailureCode.ReferenceNotProcessed);
        await expectConsistent(w.id, "20.00");
    });
});

describe("ROLLBACK", () => {
    test("desfaz uma BET (credita)", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        await useCases.submit.execute(cmd(w, Kind.Rollback, "30.00", { ref: "bet-1" }));
        await expectConsistent(w.id, "100.00");
    });

    test("desfaz um WIN (debita)", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Win, "50.00", { id: "win-1" }));
        await useCases.submit.execute(cmd(w, Kind.Rollback, "50.00", { ref: "win-1" }));
        await expectConsistent(w.id, "100.00");
    });

    test("desfaz um REFUND (debita)", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        await useCases.submit.execute(cmd(w, Kind.Refund, "30.00", { id: "refund-1", ref: "bet-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Rollback, "30.00", { ref: "refund-1" }));

        expect(result.status).toBe(Status.Processed);
        await expectConsistent(w.id, "70.00");
    });

    test("BET já reembolsada não pode sofrer ROLLBACK (nenhum crédito duplicado)", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" }));
        await useCases.submit.execute(cmd(w, Kind.Refund, "30.00", { ref: "bet-1" }));
        const result = await useCases.submit.execute(cmd(w, Kind.Rollback, "30.00", { ref: "bet-1" }));

        expect(result.failureCode).toBe(FailureCode.AlreadyReversed);
        await expectConsistent(w.id, "100.00");
    });

    test("reversão que deixaria o saldo negativo: REVERSAL_WOULD_OVERDRAW", async () => {
        const w = await newWallet("100.00");
        await useCases.submit.execute(cmd(w, Kind.Win, "50.00", { id: "win-1" })); // 150
        await useCases.submit.execute(cmd(w, Kind.Bet, "140.00")); // 10
        const result = await useCases.submit.execute(cmd(w, Kind.Rollback, "50.00", { ref: "win-1" }));

        expect(result.status).toBe(Status.Rejected);
        expect(result.failureCode).toBe(FailureCode.ReversalWouldOverdraw);
        await expectConsistent(w.id, "10.00");
    });
});

describe("referência ausente", () => {
    test("vira PENDING_REFERENCE, agenda a próxima tentativa e não mexe no saldo", async () => {
        const w = await newWallet("100.00");
        const command = cmd(w, Kind.Refund, "10.00", { ref: "ghost" });
        const result = await useCases.submit.execute(command);

        expect(result.status).toBe(Status.PendingReference);
        expect(await transactionRow(orm, command.externalTransactionId)).toMatchObject({
            status: "PENDING_REFERENCE",
            reference_attempts: 1,
        });

        const expectedNext = new Date(AT.getTime() + 5_000).toISOString();
        const [scheduled] = await query<{ same: boolean }>(
            orm,
            "select next_attempt_at = cast(? as timestamptz) as same from wager_transactions where external_transaction_id = ?",
            [expectedNext, command.externalTransactionId],
        );
        expect(scheduled?.same).toBe(true);
        await expectConsistent(w.id, "100.00");
    });
});

describe("validações de wallet e payload", () => {
    test("jogador diferente do dono da wallet: WALLET_PLAYER_MISMATCH", async () => {
        const w = await newWallet("100.00");
        const result = await useCases.submit.execute(cmd(w, Kind.Bet, "10.00", { playerId: Bun.randomUUIDv7() }));
        expect(result.failureCode).toBe(FailureCode.WalletPlayerMismatch);
        await expectConsistent(w.id, "100.00");
    });

    test("moeda diferente da wallet: CURRENCY_MISMATCH", async () => {
        const w = await newWallet("100.00", "BRL");
        const result = await useCases.submit.execute(cmd(w, Kind.Bet, "10.00", { currency: "USD" }));
        expect(result.failureCode).toBe(FailureCode.CurrencyMismatch);
        await expectConsistent(w.id, "100.00");
    });

    test("wallet inexistente lança WalletNotFoundError e não grava nada", async () => {
        const w = await newWallet("100.00");
        const ghost = { ...w, id: Bun.randomUUIDv7() };
        await expect(useCases.submit.execute(cmd(ghost, Kind.Bet, "10.00"))).rejects.toThrow(WalletNotFoundError);
        expect(await rowCount(orm, "wager_transactions")).toBe(1); // só o OPENING
    });

    test("OPENING não pode ser submetido", async () => {
        const w = await newWallet("100.00");
        await expect(useCases.submit.execute(cmd(w, Kind.Opening, "10.00"))).rejects.toThrow(InvalidTransactionError);
    });
});

describe("atomicidade", () => {
    test("falha ao gravar o ledger desfaz a transação e o saldo", async () => {
        const w = await newWallet("100.00");
        const failing = buildUseCases(orm, new FailingLedgerRepository()).submit;

        await expect(failing.execute(cmd(w, Kind.Bet, "30.00"))).rejects.toThrow("ledger boom");

        expect((await walletState(orm, w.id))?.version).toBe(1);
        expect(await rowCount(orm, "wager_transactions")).toBe(1); // só o OPENING
        await expectConsistent(w.id, "100.00");
    });
});

describe("concorrência (paralelismo real contra o PostgreSQL)", () => {
    test("cenário obrigatório: duas apostas de 80,00 com saldo de 100,00", async () => {
        const w = await newWallet("100.00");

        const results = await Promise.all([
            useCases.submit.execute(cmd(w, Kind.Bet, "80.00")),
            useCases.submit.execute(cmd(w, Kind.Bet, "80.00")),
        ]);

        const processed = results.filter((r) => r.status === Status.Processed);
        const rejected = results.filter((r) => r.status === Status.Rejected);
        expect(processed).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.failureCode).toBe(FailureCode.InsufficientFunds);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1); // exatamente um débito
        await expectConsistent(w.id, "20.00");
    });

    test("hot wallet: 20 apostas de 10,00 em paralelo com saldo de 100,00", async () => {
        const w = await newWallet("100.00");

        const results = await Promise.all(
            Array.from({ length: 20 }, () => useCases.submit.execute(cmd(w, Kind.Bet, "10.00"))),
        );

        expect(results.filter((r) => r.status === Status.Processed)).toHaveLength(10);
        expect(results.filter((r) => r.status === Status.Rejected)).toHaveLength(10);
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(10);
        expect((await walletState(orm, w.id))?.version).toBe(11); // 1 + 10 débitos
        await expectConsistent(w.id, "0.00");
    });

    test("wallets diferentes processam em paralelo sem interferência", async () => {
        const a = await newWallet("100.00", "BRL", Bun.randomUUIDv7());
        const b = await newWallet("100.00", "BRL", Bun.randomUUIDv7());

        const results = await Promise.all(
            [a, b].flatMap((w) => Array.from({ length: 5 }, () => useCases.submit.execute(cmd(w, Kind.Bet, "30.00")))),
        );

        expect(results.filter((r) => r.status === Status.Processed)).toHaveLength(6); // 3 por wallet
        await expectConsistent(a.id, "10.00");
        await expectConsistent(b.id, "10.00");
    });
});
