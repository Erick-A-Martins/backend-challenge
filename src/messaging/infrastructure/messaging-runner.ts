import {
    Injectable,
    Logger,
    type BeforeApplicationShutdown,
    type OnApplicationBootstrap,
} from "@nestjs/common";
import { describeError } from "../../shared/application/describe-error";
import { OutboxPublisher } from "../application/outbox-publisher";
import { WagerMessageConsumer } from "../application/wager-message-consumer";
import { MessagingConfig } from "../messaging.config";
import { PendingReferenceWorker } from "../../wagering/application/pending-reference.worker";

const ERROR_BACKOFF_MS = 2_000;

@Injectable()
export class MessagingRunner implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private readonly logger = new Logger(MessagingRunner.name);
    private running = false;
    private loops: Promise<void>[] = [];
    private wake!: () => void;
    private readonly stopped = new Promise<void>((resolve) => {
        this.wake = resolve;
    });

    constructor(
        private readonly config: MessagingConfig,
        private readonly publisher: OutboxPublisher,
        private readonly consumer: WagerMessageConsumer,
        private readonly pendingReferences: PendingReferenceWorker,
    ) {}

    onApplicationBootstrap(): void {
        if (!this.config.settings.workersEnabled) {
            this.logger.log("Messaging workers disabled (WORKERS_ENABLED=false)");
            return;
        }
        this.running = true;
        this.loops = [
            this.loop("outbox-publisher", async () => (await this.publisher.publishPending()).claimed, this.config.settings.publisherPollMs),
            this.loop("wager-consumer", async () => (await this.consumer.pollOnce(() => !this.running)).length, 0),
            this.loop(
                "pending-reference-worker",
                async () =>
                    (await this.pendingReferences.processDueBatch(this.config.settings.referenceRetryBatchSize)).retried,
                this.config.settings.referenceRetryPollMs,
            ),
        ];
    }

    /** Antes de o ORM fechar as conexões: termina o que está em andamento e para os loops. */
    async beforeApplicationShutdown(): Promise<void> {
        this.running = false;
        this.wake();
        await Promise.allSettled(this.loops);
    }

    private async loop(name: string, tick: () => Promise<number>, idleMs: number): Promise<void> {
        while (this.running) {
            try {
                const worked = await tick();
                if (worked === 0 && idleMs > 0) {
                    await this.sleep(idleMs);
                }
            } catch (error) {
                this.logger.error(`${name} failed: ${describeError(error)}`);
                await this.sleep(ERROR_BACKOFF_MS);
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return Promise.race([new Promise<void>((resolve) => setTimeout(resolve, ms)), this.stopped]);
    }
}
