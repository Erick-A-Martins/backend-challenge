import { Module } from "@nestjs/common";
import { Clock } from "./application/clock";
import { IdGenerator } from "./application/id-generator";
import { UnitOfWork } from "./application/unit-of-work";
import { MikroOrmUnitOfWork } from "./infrastructure/database/mikro-orm-unit-of-work";
import { UuidV7IdGenerator } from "./infrastructure/uuid-v7-id-generator";
import { SystemClock } from "./infrastructure/system-clock";
import { Hasher } from "./application/hasher";
import { Sha256Hasher } from "./infrastructure/sha256-hasher";

@Module({
    providers: [
        { provide: UnitOfWork, useClass: MikroOrmUnitOfWork },
        { provide: Clock, useClass: SystemClock },
        { provide: IdGenerator, useClass: UuidV7IdGenerator },
        { provide: Hasher, useClass: Sha256Hasher },
    ],
    exports: [UnitOfWork, Clock, IdGenerator, Hasher],
})
export class SharedModule {}
