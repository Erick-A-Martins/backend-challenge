import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CreateWalletUseCase } from "../../application/create-wallet.use-case";
import { GetWalletUseCase } from "../../application/get-wallet.use-case";
import type { WalletView } from "../../application/wallet.view";
import { parseCreateWalletRequest } from "./create-wallet.request";

@Controller("wallets")
export class WalletController {
    constructor(
        private readonly createWallet: CreateWalletUseCase,
        private readonly getWallet: GetWalletUseCase,
    ) {}

    @Post()
    create(@Body() body: unknown): Promise<WalletView> {
        return this.createWallet.execute(parseCreateWalletRequest(body));
    }

    @Get(":walletId")
    get(@Param("walletId", new ParseUUIDPipe()) walletId: string): Promise<WalletView> {
        return this.getWallet.execute(walletId);
    }
}
