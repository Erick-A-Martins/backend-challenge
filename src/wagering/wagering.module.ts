import { Module } from "@nestjs/common";
import { SharedModule } from "../shared/shared.module";
import { WalletModule } from "../wallet/wallet.module";
import { GetWagerTransactionUseCase } from "./application/get-wager-transaction.use-case";
import { SubmitWagerTransactionUseCase } from "./application/submit-wager-transaction.use-case";
import { WagerPersistenceModule } from "./wager-persistence.module";
import { WageringController } from "./interface/http/wagering.controller";
import { OutboxModule } from "../outbox/outbox.module";

@Module({
    imports: [SharedModule, WalletModule, WagerPersistenceModule, OutboxModule],
    controllers: [WageringController],
    providers: [SubmitWagerTransactionUseCase, GetWagerTransactionUseCase],
    exports: [SubmitWagerTransactionUseCase],
})
export class WageringModule {}
