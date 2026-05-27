# GAA Desktop

Electron wrapper for the standalone MVP.

## Run

From `mvp` root:

```bash
npm run desktop:run
```

This command:

1. Builds protocol and daemon.
2. Exports the Expo web client.
3. Copies runtime assets into `apps/desktop/build`.
4. Launches desktop app with embedded web UI and local daemon.

## Build Windows installer

From `mvp` root:

```bash
npm run desktop:installer
```

Installer output: `apps/desktop/dist`.
