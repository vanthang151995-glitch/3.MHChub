import path from "path";
import { fileURLToPath } from "url";
import { createMysqlSafetyArchitectureStore } from "../server/core/mysqlSafetyArchitectureStore.js";
import { loadLocalEnv } from "../server/loadEnv.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

loadLocalEnv(rootDir);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const sourceRoot = sourceArg ? sourceArg.slice("--source=".length) : "tai lieu";

const store = createMysqlSafetyArchitectureStore({ rootDir });
if (!store) {
  console.error("Safety architecture store is not configured. Check MHCHUB_MYSQL_* variables.");
  process.exit(1);
}

const result = await store.importDocumentManifest(
  { dryRun, sourceRoot },
  {
    id: "script-import-safety-documents",
    username: "script",
    displayName: "Safety document import script",
    role: "ehs",
    departmentId: "EHS"
  }
);

console.log(JSON.stringify(result.stats, null, 2));
if (result.skipped.length) {
  console.log(JSON.stringify({ skipped: result.skipped }, null, 2));
}

await store.close?.();
