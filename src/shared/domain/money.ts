import {CurrencyMismatchError} from "./errors/currency-mismatch.error.ts";
import {InvalidMoneyError} from "./errors/invalid-money.error.ts";

export interface MoneyProps {
    amount: string;
    currency: string;
}

export class Money {

    private static readonly AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,2})?$/;
    private static readonly CURRENCY_PATTERN = /^[A-Z]{3}$/;

    private constructor(
        private readonly cents: bigint,
        public readonly currency: string,
    ) {}

    static from(props: MoneyProps): Money {
        const { amount, currency } = props ?? ({} as MoneyProps);
        Money.assertValidCurrency(currency);

        if (typeof amount !== "string" || !Money.AMOUNT_PATTERN.test(amount)) {
            throw new InvalidMoneyError(
                "Amount must be a non-negative decimal string with at most 15 integer digits and 2 decimal places"
            );
        }

        const [integerPart, fractionPart = ""] = amount.split(".") as [string, string?];
        const cents = BigInt(integerPart) * 100n + BigInt(fractionPart.padEnd(2, "0"));

        return new Money(cents, currency);
    };

    static zero(currency: string): Money {
        Money.assertValidCurrency(currency);
        return new Money(0n, currency);
    };

    add(other: Money): Money {
        this.assertSameCurrency(other);
        return new Money(this.cents + other.cents, this.currency);
    };

    subtract(other: Money): Money {
        this.assertSameCurrency(other);
        return new Money(this.cents - other.cents, this.currency);
    };

    negate(): Money {
        return new Money(-this.cents, this.currency);
    };

    isZero(): boolean {
        return this.cents === 0n;
    };

    isPositive(): boolean {
        return this.cents > 0n;
    };

    isNegative(): boolean {
        return this.cents < 0n;
    };

    isLessThan(other: Money): boolean {
        this.assertSameCurrency(other);
        return this.cents < other.cents;
    };

    equals(other: Money): boolean {
        return this.currency === other.currency && this.cents === other.cents;
    };

    toJSON(): MoneyProps {
        return { amount: this.toString(), currency: this.currency };
    };

    toString(): string {
        const negative = this.cents < 0n;
        const abs = negative ? -this.cents : this.cents;
        const integerPart = abs / 100n;
        const fractionPart = (abs % 100n).toString().padStart(2, "0");
        return `${negative ? "-" : ""}${integerPart}.${fractionPart}`;
    };

    private assertSameCurrency(other: Money): void {
        if (this.currency !== other.currency) {
            throw new CurrencyMismatchError(this.currency, other.currency);
        }
    };

    private static assertValidCurrency(currency: unknown): asserts currency is string {
        if (typeof currency !== "string" || !Money.CURRENCY_PATTERN.test(currency)) {
            throw new InvalidMoneyError("Currency must be a 3-letter uppercase ISO-4217 code");
        }
    }
}
