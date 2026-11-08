import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Money } from "../../../src/shared/domain/money";
import { MikroOrmUnitOfWork } from "../../../src/shared/infrastructure/database/mikro-orm-unit-of-work";
import { Wallet } from "../../../src/wallet/domain/wallet";
import { MikroOrmWalletRepository } from "../../../src/wallet/infrastructure/persistence/mikro-orm-wallet.repository";
import { createTestOrm, truncateAll } from "../support/test-database";

const AT = new Date("2026-01-01T12:00:00.000Z");
let orm: MikroORM;

beforeAll(async () => {
    orm = await createTestOrm();
});
beforeEach(async () => {
    await truncateAll(orm);
});
afterAll(async () => {
    await orm.close();
});

describe("MikroOrmWalletRepository.findById", () => {
    test("reidrata saldo, versão e datas exatamente como foram gravados", async () => {
        const wallet = Wallet.open({
            id: Bun.randomUUIDv7(),
            playerId: "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
            initialBalance: Money.from({ amount: "123.45", currency: "BRL" }),
            now: AT,
        });
        await new MikroOrmUnitOfWork(orm.em).run(() => new MikroOrmWalletRepository(orm.em).insert(wallet));

        const found = await new MikroOrmWalletRepository(orm.em.fork()).findById(wallet.id);

        expect(found?.balance.toString()).toBe("123.45");
        expect(found?.currency).toBe("BRL");
        expect(found?.version).toBe(1);
        expect(found?.createdAt).toEqual(AT);
        expect(found?.updatedAt).toEqual(AT);
    });

    test("devolve null quando não existe", async () => {
        const repository = new MikroOrmWalletRepository(orm.em.fork());
        expect(await repository.findById(Bun.randomUUIDv7())).toBeNull();
    });
});
