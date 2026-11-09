import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Module, type INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { OutboxPublisher } from "../../../src/messaging/application/outbox-publisher";
import { SqsGateway } from "../../../src/messaging/application/sqs.gateway";
import { WagerMessageConsumer } from "../../../src/messaging/application/wager-message-consumer";
import { InboxRepository } from "../../../src/messaging/domain/inbox.repository";
import { AwsSqsGateway } from "../../../src/messaging/infrastructure/aws-sqs.gateway";
import { MikroOrmInboxRepository } from "../../../src/messaging/infrastructure/persistence/mikro-orm-inbox.repository";
import { MessagingModule } from "../../../src/messaging/messaging.module";
import config from "../../../src/shared/infrastructure/database/mikro-orm.config";
import { TEST_DATABASE_URL } from "../support/test-database";

@Module({ imports: [MikroOrmModule.forRoot({ ...config, clientUrl: TEST_DATABASE_URL }), MessagingModule] })
class MessagingTestModule {}

let context: INestApplicationContext;
let previous: string | undefined;

beforeAll(async () => {
    previous = process.env["WORKERS_ENABLED"];
    process.env["WORKERS_ENABLED"] = "false";
    context = await NestFactory.createApplicationContext(MessagingTestModule, { logger: false });
});

afterAll(async () => {
    await context.close();
    if (previous === undefined) {
        delete process.env["WORKERS_ENABLED"];
    } else {
        process.env["WORKERS_ENABLED"] = previous;
    }
});

describe("grafo de injeção da mensageria", () => {
    test("publisher e consumer resolvem com todas as dependências", () => {
        expect(context.get(OutboxPublisher, { strict: false })).toBeInstanceOf(OutboxPublisher);
        expect(context.get(WagerMessageConsumer, { strict: false })).toBeInstanceOf(WagerMessageConsumer);
    });

    test("as portas resolvem para as implementações", () => {
        expect(context.get(SqsGateway, { strict: false })).toBeInstanceOf(AwsSqsGateway);
        expect(context.get(InboxRepository, { strict: false })).toBeInstanceOf(MikroOrmInboxRepository);
    });
});
