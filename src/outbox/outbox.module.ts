import { Module } from "@nestjs/common";
import { OutboxRepository } from "./domain/outbox.repository";
import { MikroOrmOutboxRepository } from "./infrastructure/persistence/mikro-orm-outbox.repository";

@Module({
    providers: [{ provide: OutboxRepository, useClass: MikroOrmOutboxRepository }],
    exports: [OutboxRepository],
})
export class OutboxModule {}
