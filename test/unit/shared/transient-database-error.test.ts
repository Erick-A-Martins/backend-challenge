import { describe, expect, test } from "bun:test";
import { isTransientDatabaseError } from "../../../src/shared/infrastructure/database/transient-database-error";

describe("isTransientDatabaseError", () => {
    test.each(["40001", "40P01", "55P03", "57014", "08006", "ECONNREFUSED"])(
        "%s é transitório",
        (code) => expect(isTransientDatabaseError({ code })).toBe(true),
    );

    test.each(["23505", "23503", "22P02", "42703"])("%s (violação ou erro de programa) não é transitório", (code) =>
        expect(isTransientDatabaseError({ code })).toBe(false),
    );

    test("olha a causa encadeada", () => {
        expect(isTransientDatabaseError({ cause: { code: "40P01" } })).toBe(true);
    });

    test("valores que não são erros de banco", () => {
        expect(isTransientDatabaseError(new Error("boom"))).toBe(false);
        expect(isTransientDatabaseError(undefined)).toBe(false);
        expect(isTransientDatabaseError("40001")).toBe(false);
    });
});
