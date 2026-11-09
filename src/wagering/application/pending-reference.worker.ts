import { Injectable } from "@nestjs/common";
import { Clock } from "../../shared/application/clock";
import { UnitOfWork } from "../../shared/application/unit-of-work";
import { WagerTransactionRepository } from "../domain/wager-transaction.repository";
import { SubmitWagerTransactionUseCase } from "./submit-wager-transaction.use-case";

export interface PendingReferenceBatchResult {
    selected: number;
    retried: number;
}

@Injectable()
export class PendingReferenceWorker {
    constructor(
        private readonly unitOfWork: UnitOfWork,
        private readonly transactions: WagerTransactionRepository,
        private readonly submit: SubmitWagerTransactionUseCase,
        private readonly clock: Clock,
    ) {}

    async processDueBatch(limit: number): Promise<PendingReferenceBatchResult> {
        return this.unitOfWork.run(async () => {
            const due = await this.transactions.findDuePendingReferencesForUpdate(
                this.clock.now(),
                limit,
            );

            let retried = 0;
            for (const transaction of due) {
                if (await this.submit.retryPendingReference(transaction.id)) {
                    retried += 1;
                }
            }

            return { selected: due.length, retried };
        });
    }
}
