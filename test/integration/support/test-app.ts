import type { AddressInfo } from "node:net";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { configureApp } from "../../../src/app.setup";
import config from "../../../src/shared/infrastructure/database/mikro-orm.config";
import { WalletModule } from "../../../src/wallet/wallet.module";
import { TEST_DATABASE_URL } from "./test-database";
import { WageringModule } from "../../../src/wagering/wagering.module";

@Module({
    imports: [
        MikroOrmModule.forRoot({ ...config, clientUrl: TEST_DATABASE_URL }),
        WalletModule,
        WageringModule,
    ],
})
export class TestAppModule {}

export async function startTestApp(): Promise<{ app: INestApplication; baseUrl: string }> {
    const app = await NestFactory.create(TestAppModule, { logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    return { app, baseUrl: `http://127.0.0.1:${port}` };
}
