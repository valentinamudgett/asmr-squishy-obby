import { defineConfig } from "vite";

const portFlag = process.argv.indexOf("--port");
const port = portFlag > 0 ? process.argv[portFlag + 1] : "41723";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 41723,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 41723,
    strictPort: true,
  },
  assetsInclude: ["**/*.wasm"],
  // Babylon loads its shaders with lazy imports. Pre-bundled, those become hashed chunks that 504
  // (black screen) once the deps cache is re-optimized or cleared mid-session, so Babylon is served
  // as plain files instead. Each dev server port also gets its own cache, so servers started side by
  // side don't wipe each other's.
  cacheDir: `node_modules/.vite/${port}`,
  optimizeDeps: {
    exclude: ["@babylonjs/core", "@babylonjs/havok"],
  },
});
