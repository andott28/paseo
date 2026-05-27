import type { ScheduleRecord, ScheduleStatus } from "@gaa/protocol";
import type { DbCore } from "./core.js";

export class SchedulesRepo {
  constructor(private readonly core: DbCore) {}

  create(input: {
    workspaceId?: string | null;
    agentId?: string | null;
    provider: string;
    cwd: string;
    prompt: string;
    intervalSeconds: number;
    nextRunAt?: string;
  }): ScheduleRecord {
    return this.core.service.createSchedule(input);
  }

  list(): ScheduleRecord[] {
    return this.core.service.listSchedules();
  }

  listDue(nowIso?: string, limit?: number): ScheduleRecord[] {
    return this.core.service.listDueSchedules(nowIso, limit);
  }

  setStatus(scheduleId: string, status: ScheduleStatus, lastError: string | null = null): ScheduleRecord {
    return this.core.service.setScheduleStatus(scheduleId, status, lastError);
  }

  markRun(scheduleId: string, input: { success: boolean; error?: string | null }): ScheduleRecord {
    return this.core.service.markScheduleRun(scheduleId, input);
  }

  delete(scheduleId: string): void {
    this.core.service.deleteSchedule(scheduleId);
  }
}
