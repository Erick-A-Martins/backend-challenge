import "reflect-metadata";
import { defineConfig } from "@mikro-orm/postgresql";
import { ReflectMetadataProvider } from "@mikro-orm/decorators/legacy";
import { Migrator } from "@mikro-orm/migrations";

export default defineConfig({
    clientUrl: process.env.DATABASE_URL,
    metadataProvider: ReflectMetadataProvider,
    entities: [],
    discovery: { warnWhenNoEntities: false }, // remover depois de ter entidade
    extensions: [Migrator],
    migrations: {
        path: "./migrations",
    },
});
