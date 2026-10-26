// iOS 15 Safari throws "invalid group specifier name" on lookbehind and \p{}.
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Exact Unicode classes at runtime, ASCII fallback only where \p{} is a parse error (Safari < 16.4).
const unicodePunctLine = (semi) =>
  `export const unicodePunctuation = regexCheck((() => { try { return new RegExp("[\\\\p{P}\\\\p{S}]", "u"); } catch { return /[!-/:-@[-\`{-~]/; } })())${semi}`;

const patches = [
  {
    // Dropping the lookbehind is safe: findEmail re-checks the boundary at runtime via previous().
    file: "node_modules/mdast-util-gfm-autolink-literal/lib/index.js",
    from: "/(?<=^|\\s|\\p{P}|\\p{S})([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/gu",
    to: "/([-.\\w+]+)@([-\\w]+(?:\\.[-\\w]+)+)/g"
  },
  {
    file: "node_modules/micromark-util-character/index.js",
    from: "export const unicodePunctuation = regexCheck(/\\p{P}|\\p{S}/u);",
    to: unicodePunctLine(";")
  },
  {
    file: "node_modules/micromark-util-character/dev/index.js",
    from: "export const unicodePunctuation = regexCheck(/\\p{P}|\\p{S}/u)",
    to: unicodePunctLine("")
  }
];

for (const patch of patches) {
  const file = path.join(root, patch.file);
  const text = readFileSync(file, "utf8");
  if (text.includes(patch.to)) continue;
  if (!text.includes(patch.from)) {
    throw new Error(`iOS 15 regex patch did not match ${patch.file}`);
  }
  writeFileSync(file, text.replace(patch.from, patch.to));
  console.log(`patched ${patch.file}`);
}
