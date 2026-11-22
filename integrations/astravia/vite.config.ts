import { defineConfig } from "vite";
import { federation } from "@module-federation/vite";
export default defineConfig({
    plugins: [federation({ name: "jingche_connection", publicPath: "auto", filename: "remoteEntry.js", exposes: { "./plugin": "./src/index.tsx" }, manifest: { fileName: "mf-manifest.json" }, dts: false, shared: { react: { singleton: true, import: false, requiredVersion: "*" } } })],
    esbuild: { jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" },
    build: { rollupOptions: { input: "./src/index.tsx" } },
});
