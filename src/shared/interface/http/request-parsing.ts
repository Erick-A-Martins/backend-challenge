import { InvalidRequestError } from "../../domain/errors/invalid-request.error.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

export function requireString(value: unknown, field: string, maxLength = 255): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new InvalidRequestError(`${field} must be a non-empty string`);
    }
    if (value.length > maxLength) {
        throw new InvalidRequestError(`${field} must have at most ${maxLength} characters`);
    }
    return value;
}

export function optionalString(value: unknown, field: string, maxLength = 255): string | undefined {
    return value === undefined || value === null ? undefined : requireString(value, field, maxLength);
}

export function requireUuid(value: unknown, field: string): string {
    if (!isUuid(value)) {
        throw new InvalidRequestError(`${field} must be a UUID`);
    }
    return value.toLowerCase();
}

export function parseCorrelationId(value: unknown): string | undefined {
    return optionalString(value, 'X-Correlation-Id header');
}
