import type { RelaySessionRecord, WsEnvelope } from "@gaa/protocol";
import type { DatabaseService } from "./db.js";

interface RelayPollWaiter {
  resolve: (messages: WsEnvelope[]) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class RelayManager {
  private readonly db: DatabaseService;
  private readonly queues = new Map<string, WsEnvelope[]>();
  private readonly waiters = new Map<string, RelayPollWaiter>();
  private readonly maxQueueSize: number;

  constructor(db: DatabaseService, maxQueueSize = 2000) {
    this.db = db;
    this.maxQueueSize = maxQueueSize;
  }

  listSessions(): RelaySessionRecord[] {
    return this.db.listRelaySessions();
  }

  createSession(clientName: string): RelaySessionRecord {
    const session = this.db.createRelaySession(clientName);
    this.queues.set(session.id, []);
    return session;
  }

  closeSession(relaySessionId: string): RelaySessionRecord {
    const waiter = this.waiters.get(relaySessionId);
    if (waiter) {
      clearTimeout(waiter.timeout);
      waiter.resolve([]);
      this.waiters.delete(relaySessionId);
    }
    this.queues.delete(relaySessionId);
    return this.db.closeRelaySession(relaySessionId);
  }

  enqueueBroadcast(message: WsEnvelope): void {
    const sessions = this.db.listRelaySessions().filter((session) => session.status === "connected");
    for (const session of sessions) {
      this.enqueueForSession(session.id, message);
    }
  }

  touchSession(relaySessionId: string): RelaySessionRecord {
    return this.db.touchRelaySession(relaySessionId);
  }

  async poll(relaySessionId: string, maxEvents: number, timeoutMs: number): Promise<WsEnvelope[]> {
    this.db.getRelaySessionOrThrow(relaySessionId);
    this.db.touchRelaySession(relaySessionId);
    const queue = this.queues.get(relaySessionId) ?? [];
    if (queue.length > 0) {
      const events = queue.splice(0, maxEvents);
      this.queues.set(relaySessionId, queue);
      return events;
    }
    if (timeoutMs <= 0) return [];
    return await new Promise<WsEnvelope[]>((resolve) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(relaySessionId);
        resolve([]);
      }, timeoutMs);
      this.waiters.set(relaySessionId, { resolve, timeout });
    });
  }

  private enqueueForSession(relaySessionId: string, message: WsEnvelope): void {
    const queue = this.queues.get(relaySessionId) ?? [];
    queue.push(message);
    if (queue.length > this.maxQueueSize) {
      queue.splice(0, queue.length - this.maxQueueSize);
    }
    this.queues.set(relaySessionId, queue);

    const waiter = this.waiters.get(relaySessionId);
    if (waiter) {
      clearTimeout(waiter.timeout);
      this.waiters.delete(relaySessionId);
      const events = queue.splice(0, queue.length);
      this.queues.set(relaySessionId, queue);
      waiter.resolve(events);
    }
  }
}
