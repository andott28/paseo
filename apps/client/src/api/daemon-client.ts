import type { ClientSession } from "../types";

export function wsToHttpBase(wsEndpoint: string): string {
  const url = new URL(wsEndpoint);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export async function authedFetchJson<T>(session: ClientSession, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(session.httpBaseUrl + path, {
    ...init,
    headers: {
      authorization: `Bearer ${session.authToken}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error((body as { message?: string }).message ?? `Request failed ${response.status}`);
  }
  return body;
}
