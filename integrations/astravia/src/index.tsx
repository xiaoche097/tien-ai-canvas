import * as React from "react";
import { canvasWorkflow } from "./workflow";

type Connection = { configured: boolean; ready: boolean; connected: boolean; serverName?: string; message?: string };
let latest: Connection[] = [];

export default {
    activate(ctx: any) {
        function StatusIcon() {
            const [connections, setConnections] = React.useState<Connection[]>([]);
            const [offline, setOffline] = React.useState(false);
            React.useEffect(() => {
                let active = true;
                let timer: ReturnType<typeof setTimeout>;
                const check = async () => {
                    try {
                        const result = await ctx.network.request({ url: "http://127.0.0.1:18765/connections", responseType: "json", timeoutMs: 8_000 });
                        if (!result.ok || !Array.isArray(result.body.connections)) throw Error("unavailable");
                        if (active) { latest = result.body.connections; setConnections(latest); setOffline(false); }
                    } catch { if (active) { latest = []; setConnections([]); setOffline(true); } }
                    finally { if (active) timer = setTimeout(check, 5_000); }
                };
                void check();
                return () => { active = false; clearTimeout(timer); };
            }, []);
            const connected = connections.some((item) => item.connected);
            const ready = connections.some((item) => item.ready);
            const title = connected ? "境彻 · Agent 会话已连接" : offline ? "境彻 · 本机连接程序未运行" : ready ? "境彻服务可达，等待 Agent 加载连接；请新建对话或重新加载 MCP" : "境彻 · 尚未连接，请在境彻画布连接 Astravia";
            // Astravia reserves a 14px icon slot and renders the action label separately.
            return <span title={title} aria-label={title} role="img" style={{ display: "inline-flex", width: 14, height: 14, flex: "0 0 14px", alignItems: "center", justifyContent: "center", lineHeight: 0, borderRadius: 3, boxShadow: connected ? "0 0 0 1px #22c55e88" : "none" }}>
                <svg width="12" height="12" style={{ display: "block", flexShrink: 0 }} viewBox="0 0 128 132" aria-hidden="true" focusable="false"><path fill="currentColor" d="M28 43.6 70.4 20c4.4-2.4 9.6.8 9.6 5.8v17c0 3.3-1.8 6.3-4.7 7.8L51 63.4v24.2l24.3 13c2.9 1.5 4.7 4.5 4.7 7.8v13.8c0 5-5.3 8.2-9.6 5.7L28 104.2a13 13 0 0 1-6.6-11.3V54.8A13 13 0 0 1 28 43.6Z"/><circle cx="101" cy="73" r="15" fill="currentColor"/></svg>
            </span>;
        }
        return ctx.ui.registerInputAction({
            id: "connection", label: "境彻", icon: <StatusIcon />, defaultActive: true, scope_use: ["conversation", "project"],
            decoratePrompt: () => ({ metadata: { jingcheWorkflowVersion: "0.1.3" }, instructions: [latest.some((item) => item.connected) ? "境彻 MCP 连接最近已成功。需要操作境彻时先查询 jingche_connection_status，确认当前画布与工具实际可用，再安排工作。" : "境彻输入栏状态尚未确认 Agent 连通。不要仅凭 MCP 工具已加载就声称连接成功，应实际调用境彻只读工具验证；禁止自行重复付费生成。", canvasWorkflow] }),
        });
    },
};
