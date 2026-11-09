import { Injectable } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { SqsGateway } from "../messaging/application/sqs.gateway";
import { MessagingConfig } from "../messaging/messaging.config";

@Injectable()
export class HealthService {
    constructor(
        private readonly em: EntityManager,
        private readonly sqs: SqsGateway,
        private readonly messaging: MessagingConfig,
    ) {}

    live() {
        return { status: "ok" } as const;
    }

    async ready() {
        const { requestQueueUrl, deadLetterQueueUrl, eventsQueueUrl } = this.messaging.settings;
        const checks = await Promise.all([
            this.check("postgres", () => this.em.getConnection().execute("select 1")),
            this.check("sqsRequests", () => this.sqs.checkQueue(requestQueueUrl)),
            this.check("sqsDeadLetter", () => this.sqs.checkQueue(deadLetterQueueUrl)),
            this.check("sqsEvents", () => this.sqs.checkQueue(eventsQueueUrl)),
        ]);

        const ready = checks.every((check) => check.status === "up");
        return {
            status: ready ? "ready" : "not_ready",
            checks: Object.fromEntries(checks.map(({ name, status }) => [name, status])),
            httpStatus: ready ? 200 : 503,
        } as const;
    }

    private async check(name: string, operation: () => Promise<unknown>) {
        try {
            await operation();
            return { name, status: "up" as const };
        } catch {
            return { name, status: "down" as const };
        }
    }
}
