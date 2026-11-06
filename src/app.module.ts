import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { HealthModule } from "./health/health.module";
import config from "./shared/infrastructure/database/mikro-orm.config";

@Module({
    imports: [MikroOrmModule.forRoot(config), HealthModule],
})
export class AppModule {}
