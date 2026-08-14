// Copy the interpreter resources (swift/python) next to the compiled lib output.
// tsc does not emit non-TS files, and the runtime locates resources via
// `new URL('./resources/…', import.meta.url)` — never via CWD.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "resources");
const dst = join(root, "lib", "resources");
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log(`copied resources: ${src} -> ${dst}`);
