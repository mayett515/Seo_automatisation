import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const currentFile = fileURLToPath(import.meta.url);
const srcRoot = path.resolve(path.dirname(currentFile), "..");
const allowedCreateClientImport = path.join(srcRoot, "database", "database.service.ts");
const createDatabaseClientImportPattern =
  /import\s*\{[^}]*\bcreateDatabaseClient\b[^}]*\}\s*from\s*["']@localseo\/db["']/su;

void describe("DatabaseModule wiring", () => {
  void it("keeps createDatabaseClient owned by the shared API database provider", async () => {
    const offenders: string[] = [];

    for (const filePath of await collectTypeScriptFiles(srcRoot)) {
      if (filePath === allowedCreateClientImport) {
        continue;
      }

      const source = await readFile(filePath, "utf8");

      if (createDatabaseClientImportPattern.test(source)) {
        offenders.push(path.relative(srcRoot, filePath));
      }
    }

    assert.deepEqual(offenders, []);
  });
});

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectTypeScriptFiles(entryPath);
      }

      if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        return [entryPath];
      }

      return [];
    })
  );

  return files.flat();
}
