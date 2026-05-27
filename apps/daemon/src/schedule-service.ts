import type { ScheduleRecord } from "@gaa/protocol";
import type { AgentManager } from "./agent-manager.js";
import type { DatabaseService } from "./db.js";

interface ScheduleServiceHooks {
  onScheduleUpdate(schedule: ScheduleRecord): void;
  onScheduleError(schedule: ScheduleRecord, error: string): void;
}

export class ScheduleService {
  private readonly db: DatabaseService;
  private readonly agents: AgentManager;
  private readonly hooks: ScheduleServiceHooks;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(input: { db: DatabaseService; agents: AgentManager; hooks: ScheduleServiceHooks }) {
    this.db = input.db;
    this.agents = input.agents;
    this.hooks = input.hooks;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runNow(scheduleId: string): Promise<ScheduleRecord> {
    const schedule = this.db.getScheduleOrThrow(scheduleId);
    await this.executeSchedule(schedule);
    return this.db.getScheduleOrThrow(scheduleId);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = this.db.listDueSchedules(new Date().toISOString(), 16);
      for (const schedule of due) {
        await this.executeSchedule(schedule);
      }
    } finally {
      this.running = false;
    }
  }

  private async executeSchedule(schedule: ScheduleRecord): Promise<void> {
    try {
      await this.agents.runSchedule(schedule);
      const updated = this.db.markScheduleRun(schedule.id, { success: true });
      this.hooks.onScheduleUpdate(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = this.db.markScheduleRun(schedule.id, { success: false, error: message });
      this.hooks.onScheduleError(updated, message);
      this.hooks.onScheduleUpdate(updated);
    }
  }
}
