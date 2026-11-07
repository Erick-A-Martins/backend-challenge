import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import type { WalletLedgerEntry } from "../../domain/wallet-ledger-entry";
import { WalletLedgerRepository } from "../../domain/wallet-ledger.repository";
import { toLedgerEntryRecord } from "./wallet-ledger-entry.mapper";
import { WalletLedgerEntryRecord } from "./wallet-ledger-entry.record";

@Injectable()
export class MikroOrmWalletLedgerRepository extends WalletLedgerRepository {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override async append(entry: WalletLedgerEntry): Promise<void> {
        await this.em.insert(WalletLedgerEntryRecord, toLedgerEntryRecord(entry));
    }
}
