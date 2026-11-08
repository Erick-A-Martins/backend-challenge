import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";
import { configureApp } from "./app.setup.ts";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    configureApp(app);
    app.enableShutdownHooks();
    await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
