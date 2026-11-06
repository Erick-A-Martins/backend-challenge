import { Money} from "../../../src/shared/domain/money";
import { describe, expect, test} from "bun:test";
import { InvalidMoneyError } from "../../../src/shared/domain/errors/invalid-money.error.ts";
import { CurrencyMismatchError } from "../../../src/shared/domain/errors/currency-mismatch.error.ts";

const brl = (amount: string) => Money.from({amount, currency: "BRL"});

describe("testa Money.from", () => {

    test.each([
        ["25.00", "25.00"],
        ["25", "25.00"],
        ["25.5", "25.50"],
        ["0.00", "0.00"],
        ["007.50", "7.50"],
    ])("Aceita %s e normaliza para %s", (input, expected) => {
        expect(brl(input).toString()).toBe(expected);
    });

    test.each(["", "abc", "NaN", "Infinity", "1e3", "-5.00", "1.234", " 5.00", "1,50", ".50", "5."])(
        "rejeita amount inválido: '%s'",
        (input) => {
            expect(() => brl(input)).toThrow(InvalidMoneyError);
        },
    );

    test.each(['brl', 'BR', 'BRLL', '', '123'])(
        "rejeita currency inválida: '%s'",
        (currency) => {
            expect(() => Money.from({amount: "1.00", currency})).toThrow(InvalidMoneyError);
        }
    );

    test("Rejeita amount que nao é string", () => {
       expect(() => Money.from({ amount: 25 as unknown as string, currency: "BRL" })).toThrow(InvalidMoneyError)
    });
});

describe("testa Money aritméticamente", () => {

    test("nao perde precisao com valores altos", () => {
        expect(brl("9999999999999999.99").add(brl("0.01")).toString()).toBe("10000000000000000.00");
    });

    test("0.10 + 0.20 = 0.30", () => {
        expect(brl("0.10").add(brl("0.20")).toString()).toBe("0.30");
    });

    test("subtract resultando em negativo", () => {
        const result = brl("20.00").subtract(brl("80.00"));
        expect(result.isNegative()).toBe(true);
        expect(result.toString()).toBe("-60.00");
    });

    test("negate invertendo sinal", () => {
        expect(brl("5.00").negate().toString()).toBe("-5.00");
        expect(brl("0.00").negate().isZero()).toBe(true);
    });

    test("mutabilidade - operacoes retornam novas instancias", () => {
        const valueA = brl("10.00");
        const valueB = valueA.add(brl("5.00"));
        expect(valueA.toString()).toBe("10.00");
        expect(valueB.toString()).toBe("15.00");
    });

});

describe("testa Money consultas", () => {
    test("predicados", () => {
        expect(brl("0.00").isZero()).toBe(true);
        expect(brl("0.01").isPositive()).toBe(true);
        expect(brl("1.00").isLessThan(brl("2.00"))).toBe(true);
        expect(brl("2.00").isLessThan(brl("2.00"))).toBe(false);
    });

    test("equals comparando valor e moeda", () => {
        expect(brl("1.00").equals(brl("1.00"))).toBe(true);
        expect(brl("1.00").equals(Money.from({ amount: "1.00", currency: "USD" }))).toBe(false);
    });

    test("zero com toJSON", () => {
        expect(Money.zero("BRL").toJSON()).toEqual({ amount: "0.00", currency: "BRL" });
    });
});

describe("testa Money com conflito de moeda", () => {
    const usd = Money.from({ amount: "1.00", currency: "USD" });

    test("add, subtract e isLessThan lancam erro", () => {
        expect(() => brl("1.00").add(usd)).toThrow(CurrencyMismatchError);
        expect(() => brl("1.00").subtract(usd)).toThrow(CurrencyMismatchError);
        expect(() => brl("1.00").isLessThan(usd)).toThrow(CurrencyMismatchError);
    });

});
