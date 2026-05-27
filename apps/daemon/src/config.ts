import { z } from "zod";

const EnvSchema = z.object({
  GAA_DAEMON_HOST: z.string().default("0.0.0.0"),
  GAA_DAEMON_PORT: z.coerce.number().int().positive().default(9777),
  GAA_APP_BASE_URL: z.string().url().default("http://localhost:8081"),
  GAA_DB_PATH: z.string().default("./gaa-daemon.db"),
  GAA_PAIRING_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  GAA_AUTH_TOKEN_BYTES: z.coerce.number().int().positive().default(32),
  GAA_MAX_EVENTS_PER_AGENT: z.coerce.number().int().positive().default(2500),
  GAA_TARGET_EVENTS_PER_AGENT: z.coerce.number().int().positive().default(1800),
  GAA_PROVIDER_CODEX_CMD: z.string().default("codex"),
  GAA_PROVIDER_CLAUDE_CMD: z.string().default("claude"),
  GAA_PROVIDER_OPENCODE_CMD: z.string().default("opencode"),
  GAA_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
}).superRefine((value, ctx) => {
  if (value.GAA_TARGET_EVENTS_PER_AGENT >= value.GAA_MAX_EVENTS_PER_AGENT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GAA_TARGET_EVENTS_PER_AGENT"],
      message: "GAA_TARGET_EVENTS_PER_AGENT must be smaller than GAA_MAX_EVENTS_PER_AGENT",
    });
  }
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return EnvSchema.parse(env);
}
