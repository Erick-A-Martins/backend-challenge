import { Injectable } from '@nestjs/common';
import { IdGenerator } from '../application/id-generator';

@Injectable()
export class UuidV7IdGenerator extends IdGenerator {
    override next(): string {
        return Bun.randomUUIDv7();
    }
}
