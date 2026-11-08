import { describe, expect, test } from "bun:test";
import { OutboxMessageStateError } from "../../../src/outbox/domain/errors/outbox-message-state.error";
import { OutboxMessage } from "../../../src/outbox/domain/outbox-message";
import { IntegrationEvent } from "../../../src/shared/domain/integration-event";

const T0 = new Date("2026-01-01T12:00:00.000Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

class TestEvent extends IntegrationEvent<{ value: string }> {
    override readonly eventType = "TestEvent";
    override readonly version = 1;
    static make() {
        return new TestEvent({ eventId: "e1", aggregateId: "w1", correlationId: "c1", occurredAt: T0, data: { value: "x" } });
    }
}

const enqueue = () => OutboxMessage.enqueue(TestEvent.make());

describe("OutboxMessage.enqueue", () => {
    test("nasce pendente, sem tentativas e devida imediatamente", () => {
        const message = enqueue();
        expect(message.id).toBe("e1"); // o id da mensagem é o eventId
        expect(message.aggregateId).toBe("w1");
        expect(message.eventType).toBe("TestEvent");
        expect(message.attempts).toBe(0);
        expect(message.isPending()).toBe(true);
        expect(message.isDue(T0)).toBe(true);
        expect(message.payload).toMatchObject({ eventId: "e1", eventType: "TestEvent", version: 1, data: { value: "x" } });
    });
});

describe("scheduleRetry", () => {
    test("backoff exponencial: 1 s, 2 s, 4 s...", () => {
        const message = enqueue();
        message.scheduleRetry(T0, "sqs down");
        expect(message.attempts).toBe(1);
        expect(message.nextAttemptAt).toEqual(after(1_000));
        expect(message.lastError).toBe("sqs down");
        message.scheduleRetry(T0);
        expect(message.nextAttemptAt).toEqual(after(2_000));
        message.scheduleRetry(T0);
        expect(message.nextAttemptAt).toEqual(after(4_000));
    });

    test("respeita o teto de 60 s", () => {
        const message = enqueue();
        for (let i = 0; i < 12; i++) message.scheduleRetry(T0);
        expect(message.nextAttemptAt).toEqual(after(60_000));
    });

    test("so fica devida quando o horario chega", () => {
        const message = enqueue();
        message.scheduleRetry(T0);
        expect(message.isDue(after(999))).toBe(false);
        expect(message.isDue(after(1_000))).toBe(true);
    });

    test("trunca mensagens de erro muito longas", () => {
        const message = enqueue();
        message.scheduleRetry(T0, "x".repeat(2_000));
        expect(message.lastError?.length).toBe(500);
    });
});

describe("markPublished", () => {
    test("encerra a pendencia e impede novas operacoes", () => {
        const message = enqueue();
        message.markPublished(after(5));

        expect(message.isPending()).toBe(false);
        expect(message.isDue(after(10_000))).toBe(false);
        expect(message.publishedAt).toEqual(after(5));
        expect(() => message.markPublished(after(6))).toThrow(OutboxMessageStateError);
        expect(() => message.scheduleRetry(after(6))).toThrow(OutboxMessageStateError);
    });
});

describe("rehydrate", () => {
    test("reconstroi o estado sem altera-lo", () => {
        const message = OutboxMessage.rehydrate({
            id: "e9", aggregateId: "w1", eventType: "TestEvent", payload: {}, occurredAt: T0,
            attempts: 3, nextAttemptAt: after(4_000), lastError: "boom",
        });
        expect(message.attempts).toBe(3);
        expect(message.isPending()).toBe(true);
    });
});
