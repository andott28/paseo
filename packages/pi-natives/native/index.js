import { createRequire } from "module";
const require = createRequire(import.meta.url);

let native = null;
try {
  native = require("../../pi-natives.win32-x64-msvc.node");
} catch {
  try {
    native = require("pi-natives");
  } catch (e) {
    throw new Error(
      "pi-natives native addon not found. Build it with: npm run build --workspace=@getgaa/pi-natives"
    );
  }
}

export const grep = native.grep;
export const glob = native.glob;
export const searchFiles = native.searchFiles;
export default native;
