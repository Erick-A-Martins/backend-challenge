/**
 * Serialização determinística: chaves ordenadas (recursivamente), sem espaços e sem propriedades
 * `undefined`. Dois objetos com o mesmo conteúdo geram sempre a mesma string.
 */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return JSON.stringify(value);
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new TypeError("canonicalJson: non-finite numbers are not serializable");
        }
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
    }
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
    }
    throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
}
