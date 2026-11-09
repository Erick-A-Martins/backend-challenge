import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Headers } from "@nestjs/common";
import { CreateWalletUseCase } from "../../application/create-wallet.use-case";
import { GetWalletUseCase } from "../../application/get-wallet.use-case";
import type { WalletView } from "../../application/wallet.view";
import { parseCreateWalletRequest } from "./create-wallet.request";
import { parseCorrelationId } from "../../../shared/application/input-parsing.ts";

@Controller("wallets")
export class WalletController {
    constructor(
        private readonly createWallet: CreateWalletUseCase,
        private readonly getWallet: GetWalletUseCase,
    ) {}

    @Post()
    create(
        @Body() body: unknown,
        @Headers('x-correlation-id') correlationId: string | undefined,
    ): Promise<WalletView> {
        return this.createWallet.execute({
            ...parseCreateWalletRequest(body),
            correlationId: parseCorrelationId(correlationId),
        });
    }

    @Get(":walletId")
    get(@Param("walletId", new ParseUUIDPipe()) walletId: string): Promise<WalletView> {
        return this.getWallet.execute(walletId);
    }
}
