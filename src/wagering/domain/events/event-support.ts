export function defined<T>(value: T | undefined, description: string): T {
    if (value === undefined) {
        throw new Error(`Cannot build event: ${description} is missing`);
    }
    return value;
}
