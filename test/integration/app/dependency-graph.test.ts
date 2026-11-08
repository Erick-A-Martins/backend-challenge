import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { CreateWalletUseCase } from "../../../src/wallet/application/create-wallet.use-case";
import { OutboxRepository } from "../../../src/outbox/domain/outbox.repository";
import { MikroOrmOutboxRepository } from "../../../src/outbox/infrastructure/persistence/mikro-orm-outbox.repository";
import { SubmitWagerTransactionUseCase } from "../../../src/wagering/application/submit-wager-transaction.use-case";
import { startTestApp } from "../support/test-app";

let app: INestApplication;

beforeAll(async () => {
    ({ app } = await startTestApp());
});

afterAll(async () => {
    await app.close();
});

describe("grafo de dependências da aplicação", () => {
    test("resolve os casos de uso de wallet e wagering", () => {
        expect(app.get(CreateWalletUseCase)).toBeInstanceOf(CreateWalletUseCase);
        expect(app.get(SubmitWagerTransactionUseCase)).toBeInstanceOf(
            SubmitWagerTransactionUseCase,
        );
    });

    test("usa a implementação MikroORM do OutboxRepository", () => {
        expect(app.get(OutboxRepository)).toBeInstanceOf(MikroOrmOutboxRepository);
    });
});
