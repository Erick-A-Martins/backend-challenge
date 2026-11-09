const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 300_000;

export const ReferenceRetryPolicy = {
    maxAttempts: 8,

    isExhausted(attempt: number): boolean {
        return attempt >= this.maxAttempts;
    },

    nextAttemptAt(now: Date, attempt: number): Date {
        const delay = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
        return new Date(now.getTime() + delay);
    },
} as const;
