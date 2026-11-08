import { describe, expect, test } from "bun:test";
import { ReferenceRetryPolicy } from "../../../src/wagering/application/reference-retry.policy";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const delayMs = (attempt: number) => ReferenceRetryPolicy.nextAttemptAt(NOW, attempt).getTime() - NOW.getTime();

describe("ReferenceRetryPolicy", () => {
    test("backoff exponencial a partir de 5 s", () => {
        expect(delayMs(1)).toBe(5_000);
        expect(delayMs(2)).toBe(10_000);
        expect(delayMs(3)).toBe(20_000);
    });

    test("respeita o teto de 5 minutos", () => {
        expect(delayMs(7)).toBe(300_000);
        expect(delayMs(8)).toBe(300_000);
    });
});
