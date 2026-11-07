import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { UnitOfWork } from "../../application/unit-of-work";

@Injectable()
export class MikroOrmUnitOfWork extends UnitOfWork {
    constructor(private readonly em: EntityManager) {
        super();
    }

    override run<T>(work: () => Promise<T>): Promise<T> {
        return this.em.transactional(() => work());
    }
}
