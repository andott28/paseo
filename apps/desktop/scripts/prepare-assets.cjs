const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const desktopRoot = path.resolve(__dirname, "..");
const mvpRoot = path.resolve(desktopRoot, "..", "..");
const buildRoot = path.join(desktopRoot, "build");
const paritySnapshotSource = path.join(mvpRoot, "apps", "desktop", "ui-snapshot", "paseo");
const clientSourceFallback = path.join(mvpRoot, "apps", "client", "dist-web");
const daemonSource = path.join(mvpRoot, "apps", "daemon", "dist");
const protocolSource = path.join(mvpRoot, "packages", "protocol", "dist");
const clientTarget = path.join(buildRoot, "client-dist");
const daemonTarget = path.join(buildRoot, "daemon-dist");
const protocolTarget = path.join(buildRoot, "protocol-dist");
const snapshotMetaFile = path.join(paritySnapshotSource, ".snapshot-meta.json");
const isReleaseMode = process.env.CI === "true" || process.env.GAA_RELEASE_BUILD === "true";

async function removeDirectoryWithRetry(target) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.promises.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error && error.code !== "EPERM" && error.code !== "EBUSY") {
        throw error;
      }
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, 180 * (attempt + 1));
      });
    }
  }
  if (lastError) {
    throw lastError;
  }
}

async function copyDirectory(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`Missing source directory: ${source}`);
  }
  await removeDirectoryWithRetry(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function hashDirectory(root) {
  const files = [];
  const metaRelative = path.relative(root, snapshotMetaFile);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const relative = path.relative(root, fullPath);
        if (relative === metaRelative) continue;
        files.push(fullPath);
      }
    }
  };
  walk(root);
  files.sort();
  const hasher = crypto.createHash("sha256");
  for (const file of files) {
    hasher.update(path.relative(root, file));
    hasher.update(fs.readFileSync(file));
  }
  return hasher.digest("hex");
}

function ensureSnapshotMeta(source) {
  const metaExists = fs.existsSync(snapshotMetaFile);
  const digest = hashDirectory(source);
  if (!metaExists) {
    const created = {
      snapshotVersion: 1,
      source: "paseo-ui-snapshot",
      generatedAt: new Date().toISOString(),
      sha256: digest,
    };
    fs.mkdirSync(path.dirname(snapshotMetaFile), { recursive: true });
    fs.writeFileSync(snapshotMetaFile, JSON.stringify(created, null, 2));
    return { digest, status: "created" };
  }
  const meta = JSON.parse(fs.readFileSync(snapshotMetaFile, "utf8"));
  if (typeof meta.sha256 !== "string" || meta.sha256.length === 0) {
    throw new Error(`Invalid snapshot metadata: ${snapshotMetaFile}`);
  }
  if (meta.sha256 !== digest) {
    throw new Error(
      `UI snapshot drift detected. expected=${meta.sha256} actual=${digest}. Refresh ${snapshotMetaFile} after intentional snapshot update.`,
    );
  }
  return { digest, status: "verified" };
}

async function main() {
  const snapshotReady = fs.existsSync(path.join(paritySnapshotSource, "index.html"));
  if (isReleaseMode && !snapshotReady) {
    throw new Error(
      `Missing required parity UI snapshot at ${paritySnapshotSource}. Release/CI builds require repo-owned snapshot.`,
    );
  }
  const clientSource = snapshotReady ? paritySnapshotSource : clientSourceFallback;
  const snapshotState = snapshotReady ? ensureSnapshotMeta(paritySnapshotSource) : null;
  await copyDirectory(clientSource, clientTarget);
  await copyDirectory(daemonSource, daemonTarget);
  await copyDirectory(protocolSource, protocolTarget);
  process.stdout.write(
    `Desktop build assets prepared. UI source: ${clientSource}${
      snapshotState ? ` | snapshot ${snapshotState.status} sha256=${snapshotState.digest}` : ""
    }\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
