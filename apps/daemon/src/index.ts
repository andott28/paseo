import { Daemon } from "./daemon.js";
export { Daemon };

async function main(): Promise<void> {
  const daemon = new Daemon();
  await daemon.start();

  const shutdown = () => {
    daemon.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
