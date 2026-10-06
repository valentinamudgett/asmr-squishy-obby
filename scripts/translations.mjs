import { readdir, readFile } from "node:fs/promises";
import { messages } from "../src/i18n.js";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const keys = [...html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map((match) => match[1]);

const srcDir = new URL("../src/", import.meta.url);
for (const file of await readdir(srcDir)) {
  if (!file.endsWith(".js")) continue;
  const code = await readFile(new URL(file, srcDir), "utf8");
  keys.push(...[...code.matchAll(/\bt\("([^"]+)"\)/g)].map((match) => match[1]));
}

const unique = new Set(keys);
const missing = [...unique].filter((key) => !messages[key]);

if (missing.length > 0) {
  console.error(`Missing English translations: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Translations ready: ${unique.size} strings.`);
}
