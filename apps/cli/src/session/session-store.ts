import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Session = { serverId: string; authToken: string; wsEndpoint: string; httpBaseUrl: string };

const SESSION_PATH = join(homedir(), ".gaa", "session.json");

export async function saveSession(session: Session): Promise<void> {
  await mkdir(dirname(SESSION_PATH), { recursive: true });
  await writeFile(SESSION_PATH, JSON.stringify(session, null, 2), "utf8");
}

export async function loadSession(): Promise<Session> {
  const raw = await readFile(SESSION_PATH, "utf8");
  return JSON.parse(raw) as Session;
}
