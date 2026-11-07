import { Money } from "../../../src/shared/domain/money.ts";
import { describe, expect, test } from "bun:test";
import { WalletLedgerEntry } from "../../../src/wallet/domain/wallet-ledger-entry.ts";
import { LedgerDirection } from "../../../src/wallet/domain/ledger-direction.ts";
import { InvalidLedgerEntryError } from "../../../src/shared/domain/errors/invalid-ledger-entry.error.ts";

const brl = (amount: string) => Money.from({amount, currency: "BRL"});

const base = {
    id: "e1",
    walletId: "w1",
    transactionId: "t1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("testa WalletLedgerEntry.create", () => {

    test("debito e credito validos", () => {
        const debit = WalletLedgerEntry.create({
            ...base,
            direction: LedgerDirection.Debit,
            money: brl("30.00"),
            balanceBefore: brl("100.00"),
            balanceAfter: brl("70.00"),
        });
        const credit = WalletLedgerEntry.create({
            ...base,
            direction: LedgerDirection.Credit,
            money: brl("40.00"),
            balanceBefore: brl("70.00"),
            balanceAfter: brl("110.00"),
        });

        expect(debit.isBalanced()).toBe(true);
        expect(credit.isBalanced()).toBe(true);
    });

    test("rejeita aritmetica errada", () => {
        expect(() => {
            WalletLedgerEntry.create({
                ...base,
                direction: LedgerDirection.Debit,
                money: brl("30.00"),
                balanceBefore: brl("100.00"),
                balanceAfter: brl("20.00"),
            });
        }).toThrow(InvalidLedgerEntryError);
    });

    test("rejeita valor nao positivo", () => {
        expect(() => {
            WalletLedgerEntry.create({
                ...base,
                direction: LedgerDirection.Credit,
                money: brl("0.00"),
                balanceBefore: brl("10.00"),
                balanceAfter: brl("10.00"),
            });
        }).toThrow(InvalidLedgerEntryError);
    });

    test("rejeita balanceAfter negativo", () => {
        expect(() => {
            WalletLedgerEntry.create({
                ...base,
                direction: LedgerDirection.Debit,
                money: brl("20.00"),
                balanceBefore: brl("10.00"),
                balanceAfter: brl("10.00").subtract(brl("20.00")),
            })
        }).toThrow(InvalidLedgerEntryError);
    });

});

describe("testa WalletLedgerEntry.rehydrate", () => {

    test("nao revalida o estado ja persistido", () => {
        const entry = WalletLedgerEntry.rehydrate({
            ...base,
            direction: LedgerDirection.Debit,
            money: brl("30.00"),
            balanceBefore: brl("100.00"),
            balanceAfter: brl("80.00"),
        });

        expect(entry.isBalanced()).toBe(false);
    });

});
