import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UnitOfWork } from "../../application/unit-of-work";

const insideTransaction = new AsyncLocalStorage<true>();

@Injectable()
export class MikroOrmUnitOfWork extends UnitOfWork {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override run<T>(work: () => Promise<T>): Promise<T> {

        if (insideTransaction.getStore()) {
            return work();
        }
        
        return this.em.transactional(() => insideTransaction.run(true, work));
    }
}
