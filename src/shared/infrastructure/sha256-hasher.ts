import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Hasher } from "../application/hasher";

@Injectable()
export class Sha256Hasher extends Hasher {
    override sha256(input: string): string {
        return createHash("sha256").update(input, "utf8").digest("hex");
    }
}
