import { MikroORM } from "@mikro-orm/postgresql";
import config from "../../../src/shared/infrastructure/database/mikro-orm.config";

export const TEST_DATABASE_URL =
    process.env["TEST_DATABASE_URL"] ?? "postgres://wallet:wallet@localhost:5432/wallet_test";

export async function createTestOrm(): Promise<MikroORM> {
    const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
    if (!dbName.endsWith("_test")) {
        throw new Error(`Refusing to run integration tests on "${dbName}": name must end with _test`);
    }

    const orm = await MikroORM.init({ ...config, clientUrl: TEST_DATABASE_URL });
    await orm.migrator.up();
    return orm;
}

export async function truncateAll(orm: MikroORM): Promise<void> {
    await orm.em
        .getConnection()
        .execute("truncate table wallet_ledger_entries, wager_transactions, wallets");
}

export async function query<T>(orm: MikroORM, sql: string, params: unknown[] = []): Promise<T[]> {
    return (await orm.em.getConnection().execute(sql, params)) as T[];
}
