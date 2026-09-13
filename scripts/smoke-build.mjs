import { spawn } from "node:child_process";

const port = 4873;
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite preview did not become ready");
}

try {
  const response = await waitForServer();
  const html = await response.text();
  if (!html.includes("ห้องเรียนสังคมครูไต๋") || !html.includes('id="root"')) {
    throw new Error("Production HTML is missing the app shell");
  }
  const logo = await fetch(`${origin}/kruthai-logo.png`);
  if (!logo.ok || !String(logo.headers.get("content-type")).startsWith("image/")) {
    throw new Error("School logo is unavailable in the production bundle");
  }
  const assetPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
  const asset = assetPath ? await fetch(new URL(assetPath, origin)) : null;
  if (!asset?.ok || !String(asset.headers.get("content-type")).includes("javascript")) {
    throw new Error("Production JavaScript asset is unavailable");
  }
  console.log("Production bundle smoke test passed.");
} finally {
  preview.kill("SIGTERM");
  await new Promise((resolve) => preview.once("exit", resolve));
}
