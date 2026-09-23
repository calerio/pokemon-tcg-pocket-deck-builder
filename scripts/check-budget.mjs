// Fails the build when the shipped JS or card data grows past its budget (gzip sizes).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGETS = { js: 110 * 1024, data: 300 * 1024 };
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const gz = (f) => gzipSync(readFileSync(f)).length;
const files = walk("dist");
const js = files.filter((f) => f.endsWith(".js") && !f.includes("worker")).reduce((n, f) => n + gz(f), 0);
const data = files.filter((f) => f.endsWith("cards.v1.json")).reduce((n, f) => n + gz(f), 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`budget: main JS ${kb(js)} / ${kb(BUDGETS.js)} gz, card data ${kb(data)} / ${kb(BUDGETS.data)} gz`);
if (js > BUDGETS.js || data > BUDGETS.data) {
  console.error("over budget");
  process.exit(1);
}
