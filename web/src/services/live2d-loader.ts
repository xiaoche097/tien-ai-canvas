import type { Live2DLoader as Loader } from "pixi-live2d-display/cubism4";
import { apiBaseURL } from "@/services/api/request";

const installed = new WeakSet<typeof Loader>();

export function trustedLive2DURL(url: URL, apiBase: URL, bundled: URL) {
    const [theme, file, extra] = url.pathname.slice(bundled.pathname.length).split("/");
    const builtIn = url.origin === bundled.origin && url.pathname.startsWith(bundled.pathname) && !extra && (theme === "dark" || theme === "light") && ["JingcheAgent.model3.json", "JingcheAgent.moc3", "texture_00.png", "idle.motion3.json"].includes(file);
    const uploaded = url.origin === apiBase.origin && ["public", "admin/settings"].some((prefix) => url.pathname.startsWith(`${apiBase.pathname}${prefix}/appearance/live2d/`));
    return builtIn || uploaded;
}

// The SDK's default XHR loader omits cross-origin cookies and has no deadline.
// Restrict credentialed requests to our own model API, never model-provided hosts.
export function installLive2DLoader(loader: typeof Loader) {
    if (installed.has(loader)) return;
    installed.add(loader);
    loader.middlewares.unshift(async (context) => {
        const base = new URL(`${apiBaseURL.replace(/\/$/, "")}/`, window.location.href);
        const url = new URL(context.settings ? context.settings.resolveURL(context.url) : context.url, window.location.href);
        const bundled = new URL(`${import.meta.env.BASE_URL}live2d/jingche/`, window.location.href);
        if (!trustedLive2DURL(url, base, bundled)) throw new Error("Live2D 资源必须来自本站模型接口或内置镜彻模型");
        const controller = new AbortController();
        const abort = () => controller.abort();
        const deadline = setTimeout(abort, 20000);
        context.target?.once("destroy", abort);
        try {
            const response = await fetch(url, { credentials: "include", signal: controller.signal });
            if (!response.ok) throw new Error(`Live2D 资源加载失败（${response.status}）`);
            context.result = context.type === "json" ? await response.json() : await response.arrayBuffer();
        } finally {
            clearTimeout(deadline);
            context.target?.off("destroy", abort);
        }
    });
}
