import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  external: ["patchright", "puppeteer", "ffmpeg-static"],
};

await Promise.all([
  build({ ...shared, entryPoints: ["src/index.ts"], outfile: "dist/index.js" }),
  build({ ...shared, entryPoints: ["src/cli.ts"], outfile: "dist/cli.js" }),
]);

console.log("Build complete → dist/index.js, dist/cli.js");
