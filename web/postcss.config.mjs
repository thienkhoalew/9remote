// Plugins as string paths only — next build --webpack rejects inline plugin
// functions ("Malformed PostCSS Configuration"). Resolve to an absolute path:
// Turbopack dev bundles this config into .next/dev/build, so a "./..." string
// resolves against the chunk dir instead of web/. unwrap-at-layer is for
// iOS 15.0–15.3, which drop every rule nested in @layer (supported in 15.4).
import path from "node:path";

const unwrapPlugin = path.resolve("postcss-plugins/unwrap-at-layer.cjs");

const config = {
  plugins: [
    "@tailwindcss/postcss",
    unwrapPlugin
  ]
};

export default config;
