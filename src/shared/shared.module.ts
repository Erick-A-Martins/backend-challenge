import { Module } from "@nestjs/common";
import { Clock } from "./application/clock";
import { IdGenerator } from "./application/id-generator";
import { UnitOfWork } from "./application/unit-of-work";
import { MikroOrmUnitOfWork } from "./infrastructure/database/mikro-orm-unit-of-work";
import { UuidV7IdGenerator } from "./infrastructure/uuid-v7-id-generator.ts";
import { SystemClock } from "./infrastructure/system-clock.ts";

@Module({
    providers: [
        { provide: UnitOfWork, useClass: MikroOrmUnitOfWork },
        { provide: Clock, useClass: SystemClock },
        { provide: IdGenerator, useClass: UuidV7IdGenerator },
    ],
    exports: [UnitOfWork, Clock, IdGenerator],
})
export class SharedModule {}
