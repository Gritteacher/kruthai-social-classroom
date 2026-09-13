import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../dist/", import.meta.url);
const limits = {
  javascript: 2_100_000,
  stylesheet: 450_000,
  // Excalidraw emits many deferred language/diagram chunks. They are not part
  // of the initial route, so guard total growth separately from per-file size.
  total: 14_000_000,
};

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }))).flat();
}

const distPath = root.pathname;
const files = await filesIn(distPath);
const sizes = await Promise.all(files.map(async (path) => ({
  path,
  size: (await stat(path)).size,
})));
const total = sizes.reduce((sum, file) => sum + file.size, 0);
const oversized = sizes.filter((file) =>
  (file.path.endsWith(".js") && file.size > limits.javascript)
  || (file.path.endsWith(".css") && file.size > limits.stylesheet));

if (total > limits.total || oversized.length) {
  const details = oversized.map((file) => `${relative(distPath, file.path)} ${file.size} bytes`).join("\n");
  throw new Error(`Build exceeds its size budget.${details ? `\n${details}` : ""}\nTotal ${total} bytes`);
}
console.log(`Bundle budget passed: ${sizes.length} files, ${total} bytes total.`);
