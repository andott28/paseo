const { app, BrowserWindow, dialog, shell } = require("electron");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const ROOT = __dirname;
const PATH_CANDIDATES = [
  ROOT,
  process.resourcesPath,
  path.join(process.resourcesPath, "app.asar"),
  path.join(process.resourcesPath, "app"),
];

function resolveExistingPath(relativePath) {
  for (const base of PATH_CANDIDATES) {
    const candidate = path.join(base, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(ROOT, relativePath);
}

const CLIENT = resolveExistingPath(path.join("build", "client-dist"));
const DAEMON_BUNDLE = resolveExistingPath(path.join("build", "daemon-dist", "bundle.cjs"));
const ICON = resolveExistingPath(path.join("build", "icon.png"));
const DAEMON_PORT = Number(process.env.GAA_DAEMON_PORT ?? "9777");
const DAEMON_BASE = `http://127.0.0.1:${DAEMON_PORT}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".json": "application/json",
};

let daemon = null;
let webServer = null;

function createWindow(webPort) {
  const w = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#020617",
    icon: fs.existsSync(ICON) ? ICON : undefined,
    webPreferences: {
      preload: path.join(ROOT, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--gaa-daemon-http-base=${DAEMON_BASE}`],
    },
  });
  w.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  w.once("ready-to-show", () => w.show());
  w.loadURL(`http://127.0.0.1:${webPort}/`);
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
  try {
    const data = await fsp.readFile(filePath);
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

function startWebServer() {
  return new Promise((resolve, reject) => {
    const s = http.createServer(async (req, res) => {
      const u = new URL(req.url, "http://localhost");
      let p = u.pathname;
      if (p === "/" || !p) p = "/index.html";
      const base = path.resolve(CLIENT);
      const f = path.resolve(path.join(CLIENT, "." + p));
      if (!f.startsWith(base)) {
        res.statusCode = 403;
        return res.end();
      }
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        await serveFile(res, f);
        return;
      }
      if (!path.extname(p)) {
        await serveFile(res, path.join(CLIENT, "index.html"));
        return;
      }
      res.statusCode = 404;
      res.end("Not found");
    });
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      resolve({ server: s, port: s.address().port });
    });
  });
}

async function bootstrap() {
  if (!fs.existsSync(path.join(CLIENT, "index.html"))) {
    throw new Error(`Missing client index.html at ${path.join(CLIENT, "index.html")}`);
  }
  if (!fs.existsSync(DAEMON_BUNDLE)) {
    throw new Error(`Missing daemon bundle at ${DAEMON_BUNDLE}`);
  }

  const { Daemon } = require(DAEMON_BUNDLE);
  daemon = new Daemon({
    GAA_DAEMON_HOST: "127.0.0.1",
    GAA_DAEMON_PORT: DAEMON_PORT,
    GAA_APP_BASE_URL: DAEMON_BASE,
    GAA_DB_PATH: path.join(app.getPath("userData"), "gaa-daemon.db"),
  });
  await daemon.start();

  const { server, port } = await startWebServer();
  webServer = server;
  createWindow(port);
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (daemon) daemon.stop();
  if (webServer) webServer.close();
});

app.whenReady().then(() => {
  void bootstrap().catch(async (err) => {
    if (daemon) daemon.stop();
    if (webServer) webServer.close();
    await dialog.showMessageBox({
      type: "error",
      title: "GAA startup error",
      message: err instanceof Error ? err.message : String(err),
    });
    app.quit();
  });
});
