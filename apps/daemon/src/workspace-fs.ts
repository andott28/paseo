import { execFile } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

function execFileAsync(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function sanitizeSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "workspace";
}

export async function ensureProjectRootExists(rootPath: string): Promise<void> {
  await access(rootPath);
}

export async function createGitWorktree(input: {
  projectRoot: string;
  workspaceName: string;
  branch?: string;
}): Promise<{ rootPath: string; branch: string }> {
  const repoRoot = await execFileAsync("git", ["rev-parse", "--show-toplevel"], input.projectRoot);
  const branch = sanitizeSegment(input.branch ?? input.workspaceName);
  const baseName = basename(repoRoot);
  const worktreeRoot = join(dirname(repoRoot), ".gaa-worktrees", baseName, branch);
  await mkdir(dirname(worktreeRoot), { recursive: true });
  await execFileAsync("git", ["worktree", "add", worktreeRoot, "-b", branch], repoRoot);
  return { rootPath: worktreeRoot, branch };
}

