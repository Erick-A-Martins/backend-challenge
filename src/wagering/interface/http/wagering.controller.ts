import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Res } from "@nestjs/common";
import { GetWagerTransactionUseCase } from "../../application/get-wager-transaction.use-case";
import {
    SubmitWagerTransactionUseCase,
    type SubmitWagerTransactionResult,
} from "../../application/submit-wager-transaction.use-case";
import type { WagerTransactionView } from "../../application/wager-transaction.view";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { parseSubmitTransactionRequest } from "./submit-transaction.request";
import { parseCorrelationId } from "../../../shared/interface/http/request-parsing";

interface StatusSetter {
    status(code: number): unknown;
}

function httpStatusFor(result: SubmitWagerTransactionResult): number {
    switch (result.status) {
        case WagerTransactionStatus.Processed:
            return result.idempotentReplay ? 200 : 201;
        case WagerTransactionStatus.PendingReference:
            return 202;
        default:
            return 422; // REJECTED e FAILED
    }
}

@Controller()
export class WageringController {
    constructor(
        private readonly submitTransaction: SubmitWagerTransactionUseCase,
        private readonly getTransaction: GetWagerTransactionUseCase,
    ) {}

    @Post("wagering/transactions")
    async submit(
        @Headers("idempotency-key") idempotencyKey: string | undefined,
        @Headers('x-correlation-id') correlationId: string | undefined,
        @Body() body: unknown,
        @Res({ passthrough: true }) response: StatusSetter,
    ): Promise<SubmitWagerTransactionResult> {
        const command = parseSubmitTransactionRequest(idempotencyKey, body);
        const result = await this.submitTransaction.execute({
            ...command,
            correlationId: parseCorrelationId(correlationId),
        });

        response.status(httpStatusFor(result));
        return result;
    }

    @Get("wagering/transactions/:transactionId")
    byId(@Param("transactionId", new ParseUUIDPipe()) transactionId: string): Promise<WagerTransactionView> {
        return this.getTransaction.byId(transactionId);
    }

    @Get("providers/:providerId/wagering/transactions/:externalTransactionId")
    byProviderAndExternalId(
        @Param("providerId") providerId: string,
        @Param("externalTransactionId") externalTransactionId: string,
    ): Promise<WagerTransactionView> {
        return this.getTransaction.byProviderAndExternalId(providerId, externalTransactionId);
    }
}
