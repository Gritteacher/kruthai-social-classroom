import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const provider = readFileSync(join(root, "src/components/dialogs/AppDialogProvider.tsx"), "utf8");
const main = readFileSync(join(root, "src/main.tsx"), "utf8");
const dialogCss = readFileSync(join(root, "src/components/dialogs/dialog.css"), "utf8");

test("all destructive confirmations use the application dialog", () => {
  const source = collectSource(join(root, "src"));
  assert.doesNotMatch(source, /window\.confirm\s*\(/);
  assert.match(main, /<AppDialogProvider><App\s*\/><\/AppDialogProvider>/);
  assert.match(provider, /role="alertdialog"/);
});

test("dialog system supports escape, backdrop, focus and scroll locking", () => {
  assert.match(provider, /event\.key === "Escape"/);
  assert.match(provider, /event\.currentTarget === event\.target/);
  assert.match(provider, /confirmButtonRef\.current\?\.focus/);
  assert.match(provider, /returnFocusRef\.current\?\.focus/);
  assert.match(provider, /document\.body\.style\.overflow = "hidden"/);
});

test("dialogs have dark mode, mobile safe area and reduced motion styling", () => {
  assert.match(dialogCss, /:root\[data-theme="dark"\] \.app-confirm-dialog/);
  assert.match(dialogCss, /env\(safe-area-inset-bottom\)/);
  assert.match(dialogCss, /@media \(max-width: 620px\)/);
  assert.match(dialogCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(dialogCss, /\.ai-page \.ai-dialog/);
});

function collectSource(directory) {
  return readdirSync(directory).map((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return collectSource(path);
    return /\.(ts|tsx)$/.test(name) ? readFileSync(path, "utf8") : "";
  }).join("\n");
}
