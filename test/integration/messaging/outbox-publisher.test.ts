import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { MikroORM } from "@mikro-orm/postgresql";
import { OutboxPublisher } from "../../../src/messaging/application/outbox-publisher";
import type { SqsGateway } from "../../../src/messaging/application/sqs.gateway";
import { AwsSqsGateway } from "../../../src/messaging/infrastructure/aws-sqs.gateway";
import { MessagingConfig, type MessagingSettings } from "../../../src/messaging/messaging.config";
import { MikroOrmOutboxRepository } from "../../../src/outbox/infrastructure/persistence/mikro-orm-outbox.repository";
import type { OutboxMessage } from "../../../src/outbox/domain/outbox-message";
import type { Clock } from "../../../src/shared/application/clock";
import { SystemClock } from "../../../src/shared/infrastructure/system-clock";
import { UuidV7IdGenerator } from "../../../src/shared/infrastructure/uuid-v7-id-generator";
import { WagerTransactionKind as Kind } from "../../../src/wagering/domain/enums/wager-transaction-kind";
import { buildUseCases, cmd, MutableClock, rowCount } from "../support/fixtures";
import { FailingSendGateway, RecordingSqsGateway } from "../support/gateways";
import { createFifoQueue, createSqsClient, deleteQueues, drainQueue } from "../support/test-queues";
import { createTestOrm, query, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

let orm: MikroORM;
let useCases: ReturnType<typeof buildUseCases>;
let sqs: SQSClient;
let eventsQueue: string;

const config = (overrides: Partial<MessagingSettings> = {}) =>
    MessagingConfig.fromEnv().withSettings({ eventsQueueUrl: eventsQueue, publisherBatchSize: 10, ...overrides });

const publisher = (gateway: SqsGateway, clock: Clock = new SystemClock(), overrides: Partial<MessagingSettings> = {}) =>
    new OutboxPublisher(new MikroOrmOutboxRepository(orm.em), gateway, config(overrides), clock, new UuidV7IdGenerator());

const newWallet = (playerId = PLAYER, amount = "100.00") =>
    useCases.createWallet.execute({ playerId, initialBalance: { amount, currency: "BRL" } });

const pendingCount = async () =>
    (await query<{ n: number }>(orm, "select count(*)::int as n from outbox_messages where published_at is null"))[0]?.n;

beforeAll(async () => {
    orm = await createTestOrm();
    useCases = buildUseCases(orm);
    sqs = createSqsClient();
});
beforeEach(async () => {
    await truncateAll(orm);
    eventsQueue = await createFifoQueue(sqs, "events");
});
afterEach(async () => {
    await deleteQueues(sqs, [eventsQueue]);
});
afterAll(async () => {
    await orm.close();
});

describe("OutboxPublisher (PostgreSQL e SQS reais)", () => {
    test("publica os eventos pendentes no SQS, agrupados por wallet, e os confirma", async () => {
        const w = await newWallet();
        await useCases.submit.execute(cmd(w, Kind.Bet, "30.00", { id: "bet-1" })); // 4 eventos pendentes

        const result = await publisher(new AwsSqsGateway(config())).publishPending();
        expect(result).toMatchObject({ claimed: 4, published: 4, failed: 0, leaseLost: 0 });

        const messages = await drainQueue(sqs, eventsQueue, { expected: 4 });
        expect(messages).toHaveLength(4);
        expect(messages.every((message) => message.groupId === w.id)).toBe(true);
        const types = messages.map((message) => (JSON.parse(message.body) as { eventType: string }).eventType).sort();
        expect(types).toEqual([
            "WagerTransactionProcessed",
            "WagerTransactionProcessed",
            "WalletBalanceChanged",
            "WalletBalanceChanged",
        ]);

        expect(await pendingCount()).toBe(0);
        const [leases] = await query<{ n: number }>(orm, "select count(*)::int as n from outbox_messages where lock_token is not null");
        expect(leases?.n).toBe(0);
        expect((await publisher(new RecordingSqsGateway()).publishPending()).claimed).toBe(0); // nada mais a publicar
    });

    test("falha no SQS: agenda nova tentativa com backoff e publica quando o horário chega", async () => {
        const clock = new MutableClock(new Date("2026-06-01T00:00:00.000Z"));
        await newWallet(); // 2 eventos

        const failing = await publisher(new FailingSendGateway(), clock).publishPending();
        expect(failing).toMatchObject({ claimed: 2, published: 0, failed: 2 });

        const rows = await query<{ attempts: number; last_error: string; lock_token: string | null; published_at: string | null }>(
            orm,
            "select attempts, last_error, lock_token, published_at from outbox_messages",
        );
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row.attempts).toBe(1);
            expect(row.last_error).toContain("sqs unavailable");
            expect(row.lock_token).toBeNull(); // o lease foi devolvido
            expect(row.published_at).toBeNull();
        }

        const recording = new RecordingSqsGateway();
        expect((await publisher(recording, clock).publishPending()).claimed).toBe(0); // ainda dentro do backoff (1 s)

        clock.advance(1_000);
        expect(await publisher(recording, clock).publishPending()).toMatchObject({ claimed: 2, published: 2 });
        expect(recording.sent).toHaveLength(2);
        expect(await pendingCount()).toBe(0);
    });

    test("dois publishers concorrentes sobre a mesma outbox: cada evento é enviado exatamente uma vez", async () => {
        for (let i = 0; i < 6; i++) {
            await newWallet(Bun.randomUUIDv7(), "10.00"); // 12 eventos no total
        }

        const gatewayA = new RecordingSqsGateway();
        const gatewayB = new RecordingSqsGateway();
        const drain = async (instance: OutboxPublisher) => {
            while ((await instance.publishPending()).claimed > 0) {
                // continua até a outbox esvaziar
            }
        };

        await Promise.all([
            drain(publisher(gatewayA, new SystemClock(), { publisherBatchSize: 3 })),
            drain(publisher(gatewayB, new SystemClock(), { publisherBatchSize: 3 })),
        ]);

        const sentIds = [...gatewayA.sent, ...gatewayB.sent].map((message) => message.deduplicationId);
        expect(sentIds).toHaveLength(12);
        expect(new Set(sentIds).size).toBe(12); // nenhuma duplicata, nenhuma perda
        expect(await pendingCount()).toBe(0);
        expect(await rowCount(orm, "outbox_messages")).toBe(12);
    });

    test("crash do publisher: o lease expira e outra instância assume; o antigo perde o direito de confirmar", async () => {
        const clock = new MutableClock(new Date("2026-06-01T00:00:00.000Z"));
        await newWallet();

        const outbox = new MikroOrmOutboxRepository(orm.em);
        const abandoned = await outbox.claimDue({
            now: clock.now(),
            limit: 10,
            leaseUntil: new Date(clock.now().getTime() + 30_000),
            leaseToken: "dead-publisher",
        });
        expect(abandoned).toHaveLength(2);

        const recording = new RecordingSqsGateway();
        expect((await publisher(recording, clock).publishPending()).claimed).toBe(0);

        clock.advance(30_001);
        expect(await publisher(recording, clock).publishPending()).toMatchObject({ claimed: 2, published: 2 });
        expect(await pendingCount()).toBe(0);

        const stale = abandoned[0] as OutboxMessage;
        stale.markPublished(clock.now());
        expect(await outbox.markPublished(stale)).toBe(false);
    });
});
