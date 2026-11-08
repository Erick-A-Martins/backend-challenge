export abstract class Hasher {
    /** SHA-256 em hexadecimal. */
    abstract sha256(input: string): string;
}
