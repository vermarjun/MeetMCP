import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/index.js",
  format: "cjs",
  sourcemap: true,
  external: [
    // Keep native modules and large packages external
    "patchright",
    "puppeteer",
    "ffmpeg-static",
  ],
});

console.log("Build complete → dist/index.js");
