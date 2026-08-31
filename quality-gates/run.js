import { readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gates = resolve(root, "quality-gates", "gates");
const files = (await readdir(gates)).filter((name) => name.endsWith(".js")).sort((a, b) => a.localeCompare(b, "en"));
const failures = [];
for (const file of files) {
  try {
    const filePath = resolve(gates, file);
    const fileStat = await stat(filePath);
    const module = await import(`${pathToFileURL(filePath).href}?mtime=${fileStat.mtimeMs}`);
    if (typeof module.check !== "function") continue;
    const result = await module.check(root);
    if (!Array.isArray(result)) throw new Error("check(projectRoot) must return string[] or Promise<string[]>");
    failures.push(...result.map(String));
  } catch (error) {
    failures.push(`[gate-error] ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (failures.length) {
  console.log("Quality gates failed:");
  failures.forEach((failure) => console.log(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("Quality gates passed.");
}
