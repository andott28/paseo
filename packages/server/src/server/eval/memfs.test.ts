import { describe, it, expect } from "vitest";
import { InMemoryFilesystem } from "./memfs.js";

describe("InMemoryFilesystem", () => {
  describe("read / write", () => {
    it("writes and reads a file", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("/foo.txt", "hello");
      expect(await fs.read("/foo.txt")).toBe("hello");
    });

    it("reads file with normalized path", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("foo.txt", "hi");
      expect(await fs.read("./foo.txt")).toBe("hi");
      expect(await fs.read("foo.txt")).toBe("hi");
    });

    it("throws ENOENT on missing file", async () => {
      const fs = new InMemoryFilesystem();
      await expect(fs.read("/nope.txt")).rejects.toThrow("ENOENT");
    });

    it("throws EISDIR on directory", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("a/b.txt", "");
      await expect(fs.read("a")).rejects.toThrow("EISDIR");
    });

    it("overwrites existing file", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("x.txt", "one");
      await fs.write("x.txt", "two");
      expect(await fs.read("x.txt")).toBe("two");
    });
  });

  describe("grep", () => {
    it("finds pattern in a single file", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("file.txt", "foo\nbar\nbaz\n");
      const out = await fs.grep("ba.*", "file.txt");
      expect(out).toContain("bar");
      expect(out).toContain("baz");
      expect(out).not.toContain("foo");
    });

    it("searches recursively in a directory", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("src/a.ts", "console.log('hello')");
      await fs.write("src/b.ts", "const x = 1");
      await fs.write("readme.md", "# hello");
      const out = await fs.grep("hello", "src");
      expect(out).toContain("a.ts");
      expect(out).not.toContain("b.ts");
      expect(out).not.toContain("readme.md");
    });

    it("returns grep-style line numbers", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("f.txt", "aaa\nbbb\naaa\n");
      const out = await fs.grep("aaa", "f.txt");
      expect(out).toBe(["f.txt:1:aaa", "f.txt:3:aaa"].join("\n"));
    });
  });

  describe("glob", () => {
    it("matches * wildcard", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("a.ts", "");
      await fs.write("b.ts", "");
      await fs.write("c.js", "");
      const files = await fs.glob("*.ts");
      expect(files).toEqual(["a.ts", "b.ts"]);
    });

    it("matches ** recursive", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("src/a.ts", "");
      await fs.write("src/sub/b.ts", "");
      await fs.write("readme.md", "");
      const files = await fs.glob("src/**/*.ts");
      expect(files).toEqual(["src/a.ts", "src/sub/b.ts"]);
    });

    it("respects root parameter", async () => {
      const fs = new InMemoryFilesystem();
      await fs.write("src/a.ts", "");
      await fs.write("src/b.ts", "");
      await fs.write("test/c.ts", "");
      const files = await fs.glob("*.ts", "src");
      expect(files).toEqual(["src/a.ts", "src/b.ts"]);
    });

    it("returns empty array for no match", async () => {
      const fs = new InMemoryFilesystem();
      const files = await fs.glob("*.xyz");
      expect(files).toEqual([]);
    });
  });


});
