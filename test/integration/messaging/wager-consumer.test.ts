import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { SQSClient } from "@aws-sdk/client-sqs";
import type { MikroORM } from "@mikro-orm/postgresql";
import { WagerMessageConsumer } from "../../../src/messaging/application/wager-message-consumer";
import type { SqsGateway } from "../../../src/messaging/application/sqs.gateway";
import { AwsSqsGateway } from "../../../src/messaging/infrastructure/aws-sqs.gateway";
import { MikroOrmInboxRepository } from "../../../src/messaging/infrastructure/persistence/mikro-orm-inbox.repository";
import { MessagingConfig, type MessagingSettings } from "../../../src/messaging/messaging.config";
import { UnitOfWork } from "../../../src/shared/application/unit-of-work";
import { MikroOrmUnitOfWork } from "../../../src/shared/infrastructure/database/mikro-orm-unit-of-work";
import { Sha256Hasher } from "../../../src/shared/infrastructure/sha256-hasher";
import { SystemClock } from "../../../src/shared/infrastructure/system-clock";
import type { WalletView } from "../../../src/wallet/application/wallet.view";
import { buildUseCases, expectConsistent, ledgerCount, rowCount, transactionRow } from "../support/fixtures";
import { FlakyDeleteGateway } from "../support/gateways";
import { createQueueWithDlq, createSqsClient, deleteQueues, drainQueue, type QueuePair } from "../support/test-queues";
import { createTestOrm, query, truncateAll } from "../support/test-database";

const PLAYER = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1";

class FailingUnitOfWork extends UnitOfWork {
    override run<T>(): Promise<T> {
        return Promise.reject(Object.assign(new Error("deadlock detected"), { code: "40P01" }));
    }
}

let orm: MikroORM;
let useCases: ReturnType<typeof buildUseCases>;
let sqs: SQSClient;
const createdQueues: string[] = [];

const newQueues = async (visibilityTimeoutSeconds = 1, maxReceiveCount = 2): Promise<QueuePair> => {
    const queues = await createQueueWithDlq(sqs, "req", { maxReceiveCount, visibilityTimeoutSeconds });
    createdQueues.push(queues.queueUrl, queues.dlqUrl);
    return queues;
};

const config = (queues: QueuePair, overrides: Partial<MessagingSettings> = {}) =>
    MessagingConfig.fromEnv().withSettings({
        requestQueueUrl: queues.queueUrl,
        deadLetterQueueUrl: queues.dlqUrl,
        consumerWaitSeconds: 1,
        retryBaseSeconds: 1,
        retryMaxSeconds: 1,
        ...overrides,
    });

const buildConsumer = (
    queues: QueuePair,
    options: { gateway?: SqsGateway; unitOfWork?: UnitOfWork } = {},
) => {
    const settings = config(queues);
    return new WagerMessageConsumer(
        options.gateway ?? new AwsSqsGateway(settings),
        options.unitOfWork ?? new MikroOrmUnitOfWork(orm.em),
        new MikroOrmInboxRepository(orm.em),
        useCases.submit,
        new Sha256Hasher(),
        new SystemClock(),
        settings,
    );
};

const newWallet = (amount = "100.00") =>
    useCases.createWallet.execute({ playerId: PLAYER, initialBalance: { amount, currency: "BRL" } });

const requestBody = (
    w: WalletView,
    options: { messageId?: string; external?: string; amount?: string; kind?: string } = {},
) => {
    const external = options.external ?? `ext-${Bun.randomUUIDv7()}`;
    return JSON.stringify({
        messageId: options.messageId ?? `msg-${Bun.randomUUIDv7()}`,
        type: "WagerTransactionRequested",
        occurredAt: "2026-01-01T12:00:00.000Z",
        data: {
            providerId: "provider-a",
            externalTransactionId: external,
            idempotencyKey: `provider-a:${external}`,
            playerId: w.playerId,
            walletId: w.id,
            roundId: "round-1",
            gameId: "game-1",
            kind: options.kind ?? "BET",
            money: { amount: options.amount ?? "30.00", currency: "BRL" },
        },
    });
};

const send = (queues: QueuePair, body: string, groupId: string) =>
    new AwsSqsGateway(config(queues)).send(queues.queueUrl, { body, groupId, deduplicationId: Bun.randomUUIDv7() });

const inboxRows = async () =>
    query<{ message_id: string; processed: boolean }>(
        orm,
        "select message_id, processed_at is not null as processed from inbox_messages order by message_id",
    );

const balance = async (walletId: string) =>
    (await query<{ balance: string }>(orm, "select balance from wallets where id = ?", [walletId]))[0]?.balance;

beforeAll(async () => {
    orm = await createTestOrm();
    useCases = buildUseCases(orm);
    sqs = createSqsClient();
});
beforeEach(async () => {
    await truncateAll(orm);
});
afterEach(async () => {
    await deleteQueues(sqs, createdQueues.splice(0));
});
afterAll(async () => {
    await orm.close();
});

describe("WagerMessageConsumer (PostgreSQL e SQS reais)", () => {
    test("processa a mensagem: saldo, ledger, inbox e eventos na mesma transação, e depois o ack", async () => {
        const queues = await newQueues();
        const w = await newWallet("100.00");
        await send(queues, requestBody(w, { messageId: "m1", amount: "30.00" }), w.id);
        const consumer = buildConsumer(queues);

        expect(await consumer.pollOnce()).toEqual(["PROCESSED"]);

        expect(await balance(w.id)).toBe("70.00");
        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        expect(await inboxRows()).toEqual([{ message_id: "m1", processed: true }]);
        expect(await rowCount(orm, "outbox_messages")).toBe(4);
        await expectConsistent(orm, w.id, "70.00");

        const [correlated] = await query<{ n: number }>(
            orm,
            `select count(*)::int as n from outbox_messages where payload->>'correlationId' = ?`,
            ["m1"],
        );
        expect(correlated?.n).toBe(2);
        expect(await consumer.pollOnce()).toEqual([]);
    });

    test("entrega duplicada do mesmo messageId: efeito aplicado uma única vez", async () => {
        const queues = await newQueues();
        const w = await newWallet("100.00");
        const body = requestBody(w, { messageId: "m1", external: "tx-1", amount: "30.00" });
        await send(queues, body, w.id);
        await send(queues, body, w.id); // mesmo conteúdo, outra entrega

        expect(await buildConsumer(queues).pollOnce()).toEqual(["PROCESSED", "DUPLICATE"]);

        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        expect(await inboxRows()).toHaveLength(1);
        expect(await rowCount(orm, "outbox_messages")).toBe(4);
        await expectConsistent(orm, w.id, "70.00");
    });

    test("worker morto depois do commit e antes do ack: a reentrega é reconhecida pelo inbox", async () => {
        const queues = await newQueues();
        const w = await newWallet("100.00");
        await send(queues, requestBody(w, { messageId: "m1", amount: "30.00" }), w.id);
        const consumer = buildConsumer(queues, { gateway: new FlakyDeleteGateway(new AwsSqsGateway(config(queues)), 1) });

        expect(await consumer.pollOnce()).toEqual(["PROCESSED"]);
        expect(await balance(w.id)).toBe("70.00");

        await Bun.sleep(1_300);
        expect(await consumer.pollOnce()).toEqual(["DUPLICATE"]);

        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        expect(await inboxRows()).toHaveLength(1);
        await expectConsistent(orm, w.id, "70.00");
        expect(await consumer.pollOnce()).toEqual([]);
    });

    test("rejeição de negócio é gravada e a mensagem recebe ack (não vai para a DLQ)", async () => {
        const queues = await newQueues();
        const w = await newWallet("20.00");
        await send(queues, requestBody(w, { external: "tx-big", amount: "80.00" }), w.id);

        expect(await buildConsumer(queues).pollOnce()).toEqual(["PROCESSED"]);

        expect(await transactionRow(orm, "tx-big")).toMatchObject({ status: "REJECTED", failure_code: "INSUFFICIENT_FUNDS" });
        await expectConsistent(orm, w.id, "20.00");
        expect(await drainQueue(sqs, queues.dlqUrl, { expected: 1, timeoutMs: 1_500 })).toHaveLength(0);
    });

    test("mesma chave de idempotência com payload diferente: erro de negócio, ack, sem efeito", async () => {
        const queues = await newQueues();
        const w = await newWallet("100.00");
        await send(queues, requestBody(w, { messageId: "m1", external: "tx-1", amount: "30.00" }), w.id);
        await send(queues, requestBody(w, { messageId: "m2", external: "tx-1", amount: "31.00" }), w.id);

        expect(await buildConsumer(queues).pollOnce()).toEqual(["PROCESSED", "ACKED_BUSINESS_ERROR"]);

        expect(await ledgerCount(orm, w.id, "DEBIT")).toBe(1);
        expect(await inboxRows()).toEqual([{ message_id: "m1", processed: true }]);
        await expectConsistent(orm, w.id, "70.00");
    });

    test("mensagem malformada vai direto para a DLQ, com o motivo", async () => {
        const queues = await newQueues();
        await send(queues, "this is not json", "group-1");

        expect(await buildConsumer(queues).pollOnce()).toEqual(["DEAD_LETTERED"]);

        const [dead] = await drainQueue(sqs, queues.dlqUrl, { expected: 1 });
        expect(dead?.body).toBe("this is not json");
        expect(dead?.attributes["failureReason"]).toStartWith("InvalidRequestError");
        expect(await buildConsumer(queues).pollOnce()).toEqual([]);
    });

    test("wallet inexistente é erro permanente: DLQ, sem inbox e sem efeito", async () => {
        const queues = await newQueues();
        const w = await newWallet("100.00");
        await send(queues, requestBody({ ...w, id: Bun.randomUUIDv7() }, { messageId: "m1" }), w.id);

        expect(await buildConsumer(queues).pollOnce()).toEqual(["DEAD_LETTERED"]);

        const [dead] = await drainQueue(sqs, queues.dlqUrl, { expected: 1 });
        expect(dead?.attributes["failureReason"]).toStartWith("WalletNotFoundError");
        expect(await inboxRows()).toHaveLength(0);
        await expectConsistent(orm, w.id, "100.00");
    });

    test("falha transitória: retry com backoff e, esgotadas as recepções, o SQS leva para a DLQ", async () => {
        const queues = await newQueues(1, 2);
        const w = await newWallet("100.00");
        await send(queues, requestBody(w, { messageId: "m1" }), w.id);
        const consumer = buildConsumer(queues, { unitOfWork: new FailingUnitOfWork() });

        expect(await consumer.pollOnce()).toEqual(["RETRY_SCHEDULED"]);
        await Bun.sleep(1_300);
        expect(await consumer.pollOnce()).toEqual(["RETRY_SCHEDULED"]);
        await Bun.sleep(1_300);
        expect(await consumer.pollOnce()).toEqual([]);

        expect(await drainQueue(sqs, queues.dlqUrl, { expected: 1 })).toHaveLength(1);
        expect(await inboxRows()).toHaveLength(0);
        await expectConsistent(orm, w.id, "100.00");
    });

    test("shutdown: mensagens recebidas e ainda não iniciadas voltam na hora, sem esperar a visibilidade", async () => {
        const queues = await newQueues(30);
        const w = await newWallet("100.00");
        await send(queues, requestBody(w, { messageId: "m1" }), w.id);
        const consumer = buildConsumer(queues);

        expect(await consumer.pollOnce(() => true)).toEqual(["RELEASED"]);
        expect(await consumer.pollOnce()).toEqual(["PROCESSED"]);
        await expectConsistent(orm, w.id, "70.00");
    });
});
