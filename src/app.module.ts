import config from "./shared/infrastructure/database/mikro-orm.config";
import { Module } from "@nestjs/common";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { HealthModule } from "./health/health.module";
import { WalletModule } from "./wallet/wallet.module";
import { WageringModule } from "./wagering/wagering.module";

@Module({
    imports: [MikroOrmModule.forRoot(config), HealthModule, WalletModule, WageringModule],
})
export class AppModule {}
