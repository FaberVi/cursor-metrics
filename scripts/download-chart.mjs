#!/usr/bin/env bun
/**
 * Downloads Chart.js UMD bundle required by the dashboard webview.
 */
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const outPath = join(import.meta.dir, "..", "media", "dashboard", "chart.umd.js");
mkdirSync(join(outPath, ".."), { recursive: true });

const res = await fetch("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js");
if (!res.ok) {
  throw new Error(`Failed to download Chart.js: ${res.status}`);
}

writeFileSync(outPath, await res.text());
console.log(`Wrote ${outPath}`);
