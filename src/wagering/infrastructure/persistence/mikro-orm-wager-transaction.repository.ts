import { Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { DuplicateTransactionError } from "../../domain/errors/duplicate-transaction.error";
import type { WagerTransaction } from "../../domain/wager-transaction";
import { WagerTransactionKind } from "../../domain/enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { WagerTransactionRepository } from "../../domain/wager-transaction.repository";
import { toWagerTransaction, toWagerTransactionRecord } from "./wager-transaction.mapper";
import { WagerTransactionRecord } from "./wager-transaction.record";

@Injectable()
export class MikroOrmWagerTransactionRepository extends WagerTransactionRepository {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override async insert(transaction: WagerTransaction): Promise<void> {
        try {
            await this.em.insert(WagerTransactionRecord, toWagerTransactionRecord(transaction));
        } catch (error) {
            if (error instanceof UniqueConstraintViolationException) {
                throw new DuplicateTransactionError(transaction.providerId, transaction.externalTransactionId);
            }
            throw error;
        }
    }

    override async findByProviderAndExternalId(
        providerId: string,
        externalTransactionId: string,
    ): Promise<WagerTransaction | null> {
        const record = await this.em.findOne(WagerTransactionRecord, { providerId, externalTransactionId });
        return record ? toWagerTransaction(record) : null;
    }

    override async hasProcessedReversalOf(transactionId: string): Promise<boolean> {
        const count = await this.em.count(WagerTransactionRecord, {
            referenceTransactionId: transactionId,
            status: WagerTransactionStatus.Processed,
            kind: { $in: [WagerTransactionKind.Refund, WagerTransactionKind.Rollback] },
        });
        return count > 0;
    }
}
