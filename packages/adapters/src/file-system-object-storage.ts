import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStoragePort } from "./index.js";

export class FileSystemObjectStorageAdapter implements ObjectStoragePort {
  constructor(private readonly rootDir: string) {}

  async putJson(input: { key: string; value: unknown }): Promise<{ key: string }> {
    const targetPath = this.pathForKey(input.key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, `${JSON.stringify(input.value, null, 2)}\n`, "utf8");
    return { key: input.key };
  }

  async getJson(input: { key: string }): Promise<unknown> {
    const targetPath = this.pathForKey(input.key);
    return JSON.parse(await readFile(targetPath, "utf8")) as unknown;
  }

  private pathForKey(key: string): string {
    const normalizedKey = key.replaceAll("\\", "/");
    const segments = normalizedKey.split("/").filter(Boolean);

    if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
      throw new Error(`Invalid object storage key: ${key}`);
    }

    return path.join(this.rootDir, ...segments);
  }
}
