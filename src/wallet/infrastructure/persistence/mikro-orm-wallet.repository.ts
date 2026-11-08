import { Injectable } from "@nestjs/common";
import { UniqueConstraintViolationException } from "@mikro-orm/core";
import { EntityManager } from "@mikro-orm/postgresql";
import { WalletAlreadyExistsError } from "../../domain/errors/wallet-already-exists.error";
import { Wallet } from "../../domain/wallet";
import { WalletRepository } from "../../domain/wallet.repository";
import { toWallet, toWalletRecord } from "./wallet.mapper";
import { WalletRecord } from "./wallet.record";

@Injectable()
export class MikroOrmWalletRepository extends WalletRepository {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override async insert(wallet: Wallet): Promise<void> {
        try {
            await this.em.insert(WalletRecord, toWalletRecord(wallet));
        } catch (error) {

            if (error instanceof UniqueConstraintViolationException) {
                throw new WalletAlreadyExistsError(wallet.playerId, wallet.currency);
            }

            throw error;
        }
    }

    override async findById(id: string): Promise<Wallet | null> {
        const record = await this.em.findOne(WalletRecord, { id });
        return record ? toWallet(record) : null;
    }
}
