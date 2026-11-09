import { describe, expect, test } from "bun:test";
import { InboxMessageStateError } from "../../../src/messaging/domain/errors/inbox-message-state.error";
import { InboxMessage } from "../../../src/messaging/domain/inbox-message";

const T0 = new Date("2026-01-01T12:00:00.000Z");
const props = { messageId: "m1", consumerName: "c1", payloadHash: "h1", receivedAt: T0 };

describe("InboxMessage", () => {
    test("nasce não processada", () => {
        const message = InboxMessage.receive(props);
        expect(message.isProcessed()).toBe(false);
        expect(message.processedAt).toBeUndefined();
    });

    test("markProcessed registra o horário e só pode ocorrer uma vez", () => {
        const message = InboxMessage.receive(props);
        message.markProcessed(new Date(T0.getTime() + 5));
        expect(message.isProcessed()).toBe(true);
        expect(() => message.markProcessed(T0)).toThrow(InboxMessageStateError);
    });

    test("matchesPayload compara o hash", () => {
        const message = InboxMessage.receive(props);
        expect(message.matchesPayload("h1")).toBe(true);
        expect(message.matchesPayload("h2")).toBe(false);
    });

    test("rehydrate reconstrói sem validar", () => {
        const message = InboxMessage.rehydrate({ ...props, processedAt: T0 });
        expect(message.isProcessed()).toBe(true);
    });
});
