import { Money } from "../../../src/shared/domain/money.ts";
import { Wallet } from "../../../src/wallet/domain/wallet.ts";
import { describe, expect, test } from "bun:test";
import { InvalidMovementError } from "../../../src/shared/domain/errors/invalid-movement.error.ts";
import { LedgerDirection } from "../../../src/wallet/domain/enums/ledger-direction.ts";
import { CurrencyMismatchError } from "../../../src/shared/domain/errors/currency-mismatch.error.ts";
import { InsufficientFundsError } from "../../../src/shared/domain/errors/insufficient-funds.error.ts";

const brl = (amount: string) => Money.from({ amount, currency: "BRL" });
const NOW = new Date("2026-01-01T00:00:00.000Z");

const openWallet = (balance = "100.00") =>
    Wallet.open({ id: "w1", playerId: "p1", initialBalance: brl(balance), now: NOW });

const movement = (amount: string, n = 1) => ({
    entryId: `e${n}`,
    transactionId: `t${n}`,
    amount: brl(amount),
    at: NOW,
});

describe("testa Wallet.open", () => {

    test("nasce com version 1, saldo inicial e moeda do saldo", () => {
        const wallet = openWallet("1000.00");

        expect(wallet.balance.toString()).toBe("1000.00");
        expect(wallet.version).toBe(1);
        expect(wallet.currency).toBe("BRL");
    });

    test("rejeita saldo inicial quando negativo", () => {
        expect(() =>
            Wallet.open({ id: "w", playerId: "p", initialBalance: brl("1.00").negate(), now:  NOW })
        ).toThrow(InvalidMovementError);
    });

});

describe("testa Wallet.debit", () => {

    test("reducao de saldo, incrementa version e devolve o lancamento", () => {
        const wallet = openWallet("100.00");
        const entry = wallet.debit(movement("30.00"));

        expect(wallet.balance.toString()).toBe("70.00");
        expect(wallet.version).toBe(2);
        expect(entry.direction).toBe(LedgerDirection.Debit);
        expect(entry.balanceBefore.toString()).toBe("100.00");
        expect(entry.balanceAfter.toString()).toBe("70.00");
        expect(entry.isBalanced()).toBe(true);
    });

    test("permissao de zerar saldo exato", () => {
        const wallet = openWallet("80.00");
        wallet.debit(movement("80.00"));

        expect(wallet.balance.isZero()).toBe(true);
    });

    test("operacao com saldo insuficiente", () => {
        const wallet = openWallet("20.00");

        expect(() => wallet.debit(movement("80.00"))).toThrow(InsufficientFundsError);
        expect(wallet.balance.toString()).toBe("20.00");
        expect(wallet.version).toBe(1);
    });

    test("operacao com tipo de moeda diferente", () => {
        const wallet = openWallet("100.00");
        const usd = { ...movement("10.00"), amount: Money.from({ amount: "10.00", currency: "USD"}) };

        expect(() => wallet.debit(usd)).toThrow(CurrencyMismatchError);
        expect(wallet.version).toBe(1);
    });

    test("valor zero ou negativo", () => {
        const wallet = openWallet("100.00");

        expect(() => wallet.debit(movement("0.00"))).toThrow(InvalidMovementError);
        expect(() => wallet.debit({ ...movement("1.00"), amount: brl("1.00").negate() }))
            .toThrow(InvalidMovementError);
    });

});

describe("testa Wallet.credit", () => {
    test("aumenta o saldo e gera lancamento CREDIT", () => {
        const wallet = openWallet("100.00");
        const entry = wallet.credit(movement("25.50"));

        expect(wallet.balance.toString()).toBe("125.50");
        expect(wallet.version).toBe(2);
        expect(entry.direction).toBe(LedgerDirection.Credit);
        expect(entry.balanceAfter.toString()).toBe("125.50");
    });
});

describe("Invariante: testa saldo == saldo reconstruido pelo ledger", () => {
    test("apos sequencia de operacoes", () => {
        const wallet = openWallet("100.00");
        const entries = [
            wallet.debit(movement("30.00", 1)),
            wallet.credit(movement("12.25", 2)),
            wallet.debit(movement("50.00", 3)),
        ];

        const rebuilt = entries.reduce(
            (acc, e) => (e.direction === LedgerDirection.Credit ? acc.add(e.money) : acc.subtract(e.money)),
            brl("100.00"),
        );

        expect(wallet.balance.equals(rebuilt)).toBe(true);
        expect(wallet.version).toBe(4);
    });
});

describe("testa Wallet.rehydrate", () => {
    test("reconstroi o estado sem alterar", () => {
        const wallet = Wallet.rehydrate({
            id: "w1",
            playerId: "p1",
            currency: "BRL",
            balance: brl("41.00"),
            version: 7,
            createdAt: NOW,
            updatedAt: NOW,
        });

        expect(wallet.balance.toString()).toBe("41.00");
        expect(wallet.version).toBe(7);
    });
});
