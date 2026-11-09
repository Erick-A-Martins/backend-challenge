import { Module } from "@nestjs/common";
import { InboxRepository } from "./domain/inbox.repository";
import { MikroOrmInboxRepository } from "./infrastructure/persistence/mikro-orm-inbox.repository";

@Module({
    providers: [{ provide: InboxRepository, useClass: MikroOrmInboxRepository }],
    exports: [InboxRepository],
})
export class InboxPersistenceModule {}
