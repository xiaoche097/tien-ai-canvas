import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { psdLocalApi } from "./psd-local-api";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [react(), psdLocalApi()],
    server: {
        host: "127.0.0.1", port: 3002, strictPort: true,
        fs: { allow: [fileURLToPath(new URL("../..", import.meta.url)), realpathSync(fileURLToPath(new URL("../../node_modules", import.meta.url)))] },
        proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: true } },
    },
    resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
    css: { postcss: fileURLToPath(new URL("../..", import.meta.url)) },
    cacheDir: "../../../.local/cache/psd-vite",
    build: { outDir: "../../../.local/cache/psd-build", emptyOutDir: true },
});
