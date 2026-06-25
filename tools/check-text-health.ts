import { readFileSync } from "node:fs";

type RequiredTextFile = {
  path: string;
  minLines: number;
};

const requiredTextFiles: RequiredTextFile[] = [
  { path: ".env.example", minLines: 10 },
  { path: ".prettierignore", minLines: 5 },
  { path: ".gitattributes", minLines: 5 },
  { path: "package.json", minLines: 10 },
  { path: "README.md", minLines: 5 },
  { path: "AGENTS.md", minLines: 20 },
  { path: ".github/workflows/ci.yml", minLines: 20 },
  { path: "apps/api/src/main.ts", minLines: 15 },
  { path: "apps/api/src/modules/gsc.module.ts", minLines: 100 },
  { path: "packages/db/src/schema.ts", minLines: 100 },
  { path: "docs/progress/2026-06-25.md", minLines: 20 }
];

const failures: string[] = [];

for (const file of requiredTextFiles) {
  const buffer = readFileSync(file.path);
  const text = buffer.toString("utf8");
  const lfCount = [...text].filter((char) => char === "\n").length;

  if (buffer.includes(0)) {
    failures.push(`${file.path}: contains NUL bytes; expected a text file`);
  }

  if (text.includes("\r")) {
    failures.push(`${file.path}: contains CR characters; expected LF-only text`);
  }

  if (!text.endsWith("\n")) {
    failures.push(`${file.path}: missing final newline`);
  }

  if (lfCount < file.minLines) {
    failures.push(
      `${file.path}: has ${lfCount} line breaks; expected at least ${file.minLines} to prevent flattened-file regressions`
    );
  }
}

if (failures.length > 0) {
  console.error("Text health check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Text health check passed.");
