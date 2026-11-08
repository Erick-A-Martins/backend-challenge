import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { CurrencyMismatchError } from "../../domain/errors/currency-mismatch.error";
import { DomainError } from "../../domain/errors/domain-error";
import { InvalidMoneyError } from "../../domain/errors/invalid-money.error";
import { InvalidRequestError } from "../../domain/errors/invalid-request.error";
import { WalletAlreadyExistsError } from "../../../wallet/domain/errors/wallet-already-exists.error";
import { WalletNotFoundError } from "../../../wallet/domain/errors/wallet-not-found.error";

interface ResponseLike {
    status(code: number): { json(body: unknown): unknown };
}

interface ErrorMapping {
    status: number;
    code: string;
}

const DOMAIN_ERROR_MAPPINGS: ReadonlyArray<readonly [abstract new (...args: never[]) => DomainError, ErrorMapping]> = [
    [InvalidRequestError, { status: 400, code: "INVALID_REQUEST" }],
    [InvalidMoneyError, { status: 400, code: "INVALID_MONEY" }],
    [WalletNotFoundError, { status: 404, code: "WALLET_NOT_FOUND" }],
    [WalletAlreadyExistsError, { status: 409, code: "WALLET_ALREADY_EXISTS" }],
    [CurrencyMismatchError, { status: 422, code: "CURRENCY_MISMATCH" }],
];

const errorBody = (code: string, message: string) => ({ error: { code, message } });

function codeForHttpStatus(status: number): string {
    if (status === 400) return "INVALID_REQUEST";
    if (status === 404) return "NOT_FOUND";
    return `HTTP_${status}`;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<ResponseLike>();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            response.status(status).json(errorBody(codeForHttpStatus(status), exception.message));
            return;
        }

        if (exception instanceof DomainError) {
            const mapping = DOMAIN_ERROR_MAPPINGS.find(([type]) => exception instanceof type)?.[1];
            if (mapping) {
                response.status(mapping.status).json(errorBody(mapping.code, exception.message));
                return;
            }
        }

        this.logger.error(
            exception instanceof Error ? `${exception.name}: ${exception.message}` : "Unknown error",
            exception instanceof Error ? exception.stack : undefined,
        );
        response.status(500).json(errorBody("INTERNAL_ERROR", "Internal server error"));
    }
}
