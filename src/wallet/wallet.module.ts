import { Module } from "@nestjs/common";
import { SharedModule } from "../shared/shared.module";
import { CreateWalletUseCase } from "./application/create-wallet.use-case";
import { WalletLedgerRepository } from "./domain/wallet-ledger.repository";
import { WalletRepository } from "./domain/wallet.repository";
import { MikroOrmWalletLedgerRepository } from "./infrastructure/persistence/mikro-orm-wallet-ledger.repository";
import { MikroOrmWalletRepository } from "./infrastructure/persistence/mikro-orm-wallet.repository";
import { GetWalletUseCase } from "./application/get-wallet.use-case";
import { WalletController } from "./interface/http/wallet.controller";
import { WagerPersistenceModule } from "../wagering/wager-persistence.module";
import { OutboxModule } from "../outbox/outbox.module";

@Module({
    imports: [SharedModule, WagerPersistenceModule, OutboxModule],
    controllers: [WalletController],
    providers: [
        { provide: WalletRepository, useClass: MikroOrmWalletRepository },
        { provide: WalletLedgerRepository, useClass: MikroOrmWalletLedgerRepository },
        CreateWalletUseCase,
        GetWalletUseCase,
    ],
    exports: [CreateWalletUseCase, GetWalletUseCase, WalletRepository, WalletLedgerRepository],
})
export class WalletModule {}
