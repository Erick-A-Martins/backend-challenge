import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../../../src/shared/domain/canonical-json";

describe("canonicalJson", () => {
    test("ordena as chaves recursivamente", () => {
        expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    });

    test("a ordem original das chaves não altera o resultado", () => {
        expect(canonicalJson({ x: 'a', y: 'b' })).toBe(canonicalJson({ y: 'b', x: 'a' }));
    });

    test("preserva a ordem dos arrays", () => {
        expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    });

    test("ignora propriedades undefined", () => {
        expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    });

    test("escapa strings corretamente", () => {
        expect(canonicalJson({ a: 'x"y' })).toBe('{"a":"x\\"y"}');
    });

    test("rejeita valores não serializáveis", () => {
        expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
        expect(() => canonicalJson({ a: 10n })).toThrow(TypeError);
    });
});
