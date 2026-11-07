import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import type { WagerTransaction } from "../../domain/wager-transaction";
import { WagerTransactionRepository } from "../../domain/wager-transaction.repository";
import { toWagerTransactionRecord } from "./wager-transaction.mapper";
import { WagerTransactionRecord } from "./wager-transaction.record";

@Injectable()
export class MikroOrmWagerTransactionRepository extends WagerTransactionRepository {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override async insert(transaction: WagerTransaction): Promise<void> {
        await this.em.insert(WagerTransactionRecord, toWagerTransactionRecord(transaction));
    }
}
