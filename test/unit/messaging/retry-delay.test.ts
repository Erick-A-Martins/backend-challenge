import { describe, expect, test } from "bun:test";
import { retryDelaySeconds } from "../../../src/messaging/application/retry-delay";

describe("retryDelaySeconds", () => {
    test("dobra a cada recepção a partir da base", () => {
        expect([1, 2, 3, 4].map((count) => retryDelaySeconds(count, 2, 60))).toEqual([2, 4, 8, 16]);
    });

    test("respeita o teto", () => {
        expect(retryDelaySeconds(6, 2, 60)).toBe(60);
        expect(retryDelaySeconds(20, 2, 60)).toBe(60);
    });

    test("contagem inválida cai na base", () => {
        expect(retryDelaySeconds(0, 2, 60)).toBe(2);
    });
});
