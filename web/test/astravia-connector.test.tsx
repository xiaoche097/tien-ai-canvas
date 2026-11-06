import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Keep the fixture under web so Bun resolves the app's JSX runtime normally.
const dir = mkdtempSync(join(import.meta.dir, ".astravia-component-"));
const reactPath = import.meta.resolve("react");
writeFileSync(join(dir, "ui.tsx"), `import * as React from ${JSON.stringify(reactPath)};
export const App={useApp:()=>({message:{success:()=>{}}})};
export const AppModal=({open,children})=>open?React.createElement("section",null,children):null;
export const Tooltip=({children})=>children;
export const Alert=({title})=>React.createElement("div",null,title);
export const Spin=({children})=>children;
export const Button=({children,onClick,disabled})=>React.createElement("button",{onClick,disabled},children);
export const RefreshCw=()=>null;
export const prepareCanvasForCloudAction=async()=>{};
export const state={connected:true,calls:0};
export const inspectAstravia=async()=>{state.calls++;return {id:"one",authorized:true,configured:true,connected:state.connected,serverName:"境彻"};};
export const linkAstravia=async()=>{throw Error("connection should not be recreated")};
export const unlinkAstravia=async()=>({});`);
const source = readFileSync(new URL("../src/components/canvas/canvas-astravia-connector.tsx", import.meta.url), "utf8")
    .replace('from "react"', `from ${JSON.stringify(reactPath)}`)
    .replace(/from "(?:antd|lucide-react|@\/components\/ui\/product\/app-modal|@\/components\/ui\/base\/tooltip|@\/services\/astravia-desktop|@\/services\/user-data-sync)"/g, `from ${JSON.stringify(join(dir, "ui.tsx"))}`);
writeFileSync(join(dir, "component.tsx"), source);
const dom = new Window({ url: "http://localhost:3000/" });
const saved = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, SVGElement: dom.SVGElement, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AstraviaConnector } = await import(join(dir, "component.tsx"));
const { state } = await import(join(dir, "ui.tsx"));
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
    rmSync(dir, { recursive: true, force: true });
});

test("connection is checked without opening the dialog and the ring clears after a failed focus check", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () => root.render(<AstraviaConnector canvasId="canvas" />));
        expect(state.calls).toBeGreaterThan(0);
        expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Astravia · 已连接");
        expect(host.querySelector("button")?.classList.contains("agent-connector-item--connected")).toBe(true);
        state.connected = false;
        await act(async () => { window.dispatchEvent(new dom.Event("focus") as unknown as Event); });
        expect(host.querySelector("button")?.classList.contains("agent-connector-item--connected")).toBe(false);
        expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("Astravia · 连接暂不可用");
    } finally { await act(async () => root.unmount()); host.remove(); }
});
