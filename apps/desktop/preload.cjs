const { contextBridge } = require("electron");

const ARG_PREFIX = "--gaa-daemon-http-base=";

function resolveDaemonBase() {
  const match = process.argv.find((value) => value.startsWith(ARG_PREFIX));
  if (!match) {
    return "http://127.0.0.1:9777";
  }
  return match.slice(ARG_PREFIX.length);
}

contextBridge.exposeInMainWorld("__GAA_DAEMON_HTTP_BASE__", resolveDaemonBase());
