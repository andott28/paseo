import { DatabaseService } from "../db.js";

export class DbCore {
  constructor(public readonly service: DatabaseService) {}

  close(): void {
    this.service.close();
  }
}

export function createDbCore(dbPath: string): DbCore {
  return new DbCore(new DatabaseService(dbPath));
}
