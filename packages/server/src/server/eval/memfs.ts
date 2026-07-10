import { ToolBridge } from "./types.js";

export class InMemoryFilesystem implements ToolBridge {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();

  constructor() {
    this.dirs.add("");
  }

  private norm(p: string): string {
    let n = p.replace(/\\/g, "/").replace(/\/+/g, "/");
    if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
    if (n.startsWith("./")) n = n.slice(2);
    return n;
  }

  private parent(p: string): string {
    const n = this.norm(p);
    const i = n.lastIndexOf("/");
    return i === -1 ? "" : n.slice(0, i);
  }

  private ensureParent(p: string): void {
    const par = this.parent(p);
    if (par && !this.dirs.has(par)) {
      const parts = par.split("/");
      let cur = "";
      for (const part of parts) {
        cur = cur ? `${cur}/${part}` : part;
        this.dirs.add(cur);
      }
    }
  }

  async read(path: string): Promise<string> {
    const n = this.norm(path);
    if (this.dirs.has(n)) throw new Error(`EISDIR: is a directory: ${path}`);
    const c = this.files.get(n);
    if (c === undefined) throw new Error(`ENOENT: file not found: ${path}`);
    return c;
  }

  async write(path: string, content: string): Promise<void> {
    const n = this.norm(path);
    this.ensureParent(n);
    this.files.set(n, content);
  }

  async grep(pattern: string, path: string): Promise<string> {
    const n = this.norm(path);
    const regex = new RegExp(pattern);
    const results: string[] = [];

    if (this.dirs.has(n)) {
      const prefix = n ? `${n}/` : "";
      for (const [fp, fc] of this.files) {
        if (!fp.startsWith(prefix)) continue;
        const lines = fc.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) results.push(`${fp}:${i + 1}:${lines[i]}`);
        }
      }
    } else {
      const fc = this.files.get(n);
      if (fc === undefined) throw new Error(`ENOENT: path not found: ${path}`);
      const lines = fc.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) results.push(`${n}:${i + 1}:${lines[i]}`);
      }
    }

    return results.join("\n");
  }

  async glob(pattern: string, root: string = "."): Promise<string[]> {
    const base = root === "." || root === "./" ? "" : this.norm(root);
    const rex = new RegExp(`^${this.globToRegex(pattern)}$`);
    const results: string[] = [];

    for (const fp of this.files.keys()) {
      if (this.dirs.has(fp)) continue;
      const rel = !base ? fp : fp.startsWith(`${base}/`) ? fp.slice(base.length + 1) : null;
      if (rel !== null && rex.test(rel)) results.push(fp);
    }

    return results.sort();
  }

  private globToRegex(p: string): string {
    let out = "";
    let i = 0;
    while (i < p.length) {
      const c = p[i];
      if (c === "*" && p[i + 1] === "*" && p[i + 2] === "/") {
        out += "(.*/)?";
        i += 3;
      } else if (c === "*" && p[i + 1] === "*" && i + 2 >= p.length) {
        out += ".*";
        i += 2;
      } else if (c === "*") {
        out += "[^/]*";
        i++;
      } else if (c === "?") {
        out += "[^/]";
        i++;
      } else if (c === ".") {
        out += "\\.";
        i++;
      } else {
        out += c;
        i++;
      }
    }
    return out;
  }
}
