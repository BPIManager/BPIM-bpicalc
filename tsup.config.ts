import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/v1.ts", "src/v2.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
});
