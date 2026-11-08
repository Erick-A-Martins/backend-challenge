import { Module } from "@nestjs/common";
import { SharedModule } from "../shared/shared.module.ts";
import { WalletModule } from "../wallet/wallet.module.ts";
import { WagerPersistenceModule } from "./wager-persistence.module.ts";
import { SubmitWagerTransactionUseCase } from "./application/submit-wager-transaction.use-case.ts";

@Module({
    imports: [SharedModule, WalletModule, WagerPersistenceModule],
    providers: [SubmitWagerTransactionUseCase],
    exports: [SubmitWagerTransactionUseCase],
})
export class WageringModule {}
