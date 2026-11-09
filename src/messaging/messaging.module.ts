// src/messaging/messaging.module.ts
import { Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module";
import { SharedModule } from "../shared/shared.module";
import { WageringModule } from "../wagering/wagering.module";
import { OutboxPublisher } from "./application/outbox-publisher";
import { SqsGateway } from "./application/sqs.gateway";
import { WagerMessageConsumer } from "./application/wager-message-consumer";
import { InboxPersistenceModule } from "./inbox-persistence.module";
import { AwsSqsGateway } from "./infrastructure/aws-sqs.gateway";
import { MessagingRunner } from "./infrastructure/messaging-runner";
import { MessagingConfig } from "./messaging.config";

@Module({
    imports: [SharedModule, OutboxModule, WageringModule, InboxPersistenceModule],
    providers: [
        { provide: MessagingConfig, useFactory: () => MessagingConfig.fromEnv() },
        { provide: SqsGateway, useClass: AwsSqsGateway },
        OutboxPublisher,
        WagerMessageConsumer,
        MessagingRunner,
    ],
    exports: [OutboxPublisher, WagerMessageConsumer, SqsGateway],
})
export class MessagingModule {}
