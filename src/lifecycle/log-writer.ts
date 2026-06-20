import fs from "node:fs";
import path from "node:path";

/**
 * Appends a single JSON object as one line to a .jsonl evidence file.
 * Creates parent directories and the file itself if they don't exist.
 * Used for every evidence stream in this project so logs are durable,
 * append-only, and diffable across runs.
 */
export function appendJsonl(filePath: string, record: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.appendFileSync(resolved, JSON.stringify(record) + "\n", "utf-8");
}

export function readJsonl<T = unknown>(filePath: string): T[] {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return [];
  return fs
    .readFileSync(resolved, "utf-8")
    .split("\n")
    .filter((line: string) => line.trim().length > 0)
    .map((line: string) => JSON.parse(line) as T);
}

export function writeJson(filePath: string, data: unknown): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2), "utf-8");
}

export function readJson<T = unknown>(filePath: string): T | null {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, "utf-8")) as T;
}
