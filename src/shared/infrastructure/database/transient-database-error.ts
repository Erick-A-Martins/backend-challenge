const TRANSIENT_SQLSTATES = new Set(["40001", "40P01", "55P03", "57014", "57P01", "57P02", "57P03", "53300"]);
const TRANSIENT_NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND"]);

export function isTransientDatabaseError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }
    const { code, cause } = error as { code?: unknown; cause?: unknown };
    if (typeof code === "string") {
        return TRANSIENT_SQLSTATES.has(code) || code.startsWith("08") || TRANSIENT_NETWORK_CODES.has(code);
    }
    return cause !== undefined && cause !== error ? isTransientDatabaseError(cause) : false;
}
