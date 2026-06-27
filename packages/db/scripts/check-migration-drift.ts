import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(scriptDir);
const migrationsDir = join(packageDir, "migrations");
const tempDirName = `.drizzle-check-tmp-${randomUUID().replaceAll("-", "")}`;
const tempDir = join(packageDir, tempDirName);
const tempMigrationsDir = join(tempDir, "migrations");
const tempConfigPath = join(tempDir, "drizzle.config.ts");

try {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Missing migrations directory: ${migrationsDir}`);
  }

  mkdirSync(tempMigrationsDir, { recursive: true });
  cpSync(migrationsDir, tempMigrationsDir, { recursive: true });

  writeFileSync(
    tempConfigPath,
    [
      'import { defineConfig } from "drizzle-kit";',
      "",
      "export default defineConfig({",
      '  schema: "./src/schema.ts",',
      `  out: "./${tempDirName}/migrations",`,
      '  dialect: "postgresql",',
      '  dbCredentials: { url: "postgres://postgres:postgres@localhost:5432/local_seo" }',
      "});",
      ""
    ].join("\n")
  );

  runDrizzle(["check"]);
  runDrizzle(["generate", "--config", `${tempDirName}/drizzle.config.ts`, "--name", "__drift_check"]);

  const diff = diffDirectories(migrationsDir, tempMigrationsDir);

  if (diff.length > 0) {
    throw new Error(
      [
        "Drizzle schema and committed migrations are out of sync.",
        "Run `corepack pnpm db:generate`, review the generated migration, and commit it.",
        "",
        ...diff.map((item) => `- ${item}`)
      ].join("\n")
    );
  }

  console.log("Drizzle migration drift check passed.");
} finally {
  if (tempDir.startsWith(packageDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runDrizzle(args: string[]): void {
  const drizzleKitBin = join(packageDir, "node_modules/drizzle-kit/bin.cjs");
  const result = spawnSync(process.execPath, [drizzleKitBin, ...args], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";

  if (stdout.length > 0) {
    process.stdout.write(stdout);
  }

  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }

  if (result.status !== 0) {
    throw new Error(`drizzle-kit ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function diffDirectories(leftDir: string, rightDir: string): string[] {
  const leftFiles = listFiles(leftDir);
  const rightFiles = listFiles(rightDir);
  const allFiles = new Set([...leftFiles.keys(), ...rightFiles.keys()]);
  const diff: string[] = [];

  for (const file of [...allFiles].sort()) {
    const leftPath = leftFiles.get(file);
    const rightPath = rightFiles.get(file);

    if (!leftPath) {
      diff.push(`unexpected generated file: ${file}`);
      continue;
    }

    if (!rightPath) {
      diff.push(`missing generated file: ${file}`);
      continue;
    }

    if (!readFileSync(leftPath).equals(readFileSync(rightPath))) {
      diff.push(`changed generated file: ${file}`);
    }
  }

  return diff;
}

function listFiles(rootDir: string): Map<string, string> {
  const files = new Map<string, string>();
  visit(rootDir);
  return files;

  function visit(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = join(dir, entry.name);

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        files.set(relative(rootDir, absolutePath).replaceAll("\\", "/"), absolutePath);
      }
    }
  }
}
