import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Spin } from "antd";
import { RefreshCw } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { Tooltip } from "@/components/ui/base/tooltip";
import { inspectAstravia, linkAstravia, unlinkAstravia, type AstraviaDesktopStatus } from "@/services/astravia-desktop";
import { prepareCanvasForCloudAction } from "@/services/user-data-sync";

// Astravia's orbit mark, adapted from its Apache-2.0 desktop brand asset.
export function AstraviaIcon() {
    return <svg width="20" height="20" viewBox="0 0 1024 1024" fill="none" aria-hidden="true">
        <rect x="64" y="64" width="896" height="896" rx="240" fill="#4f46e5" />
        <ellipse cx="512" cy="512" rx="300" ry="138" stroke="#dce0ea" strokeWidth="100" transform="rotate(-24 512 512)" />
        <circle cx="714" cy="342" r="112" fill="#fbbf24" />
        <circle cx="300" cy="280" r="48" fill="#dce0ea" />
        <circle cx="286" cy="620" r="54" fill="#dce0ea" opacity=".7" />
        <circle cx="640" cy="668" r="46" fill="#fbbf24" />
    </svg>;
}

export function AstraviaConnector({ canvasId }: { canvasId: string }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState<AstraviaDesktopStatus | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [revoking, setRevoking] = useState(false);
    const [refresh, setRefresh] = useState(0);
    const request = useRef<AbortController | null>(null);
    const scope = useRef(canvasId);
    scope.current = canvasId;

    useEffect(() => {
        setStatus(null);
        setError("");
        setConnecting(false);
        return () => request.current?.abort();
    }, [canvasId]);

    useEffect(() => {
        if (!canvasId || connecting || revoking) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let pending = false;
        setLoading(true);
        setError("");
        const check = async () => {
            if (pending || controller.signal.aborted) return;
            pending = true;
            if (timer) clearTimeout(timer);
            try {
                const value = await inspectAstravia(canvasId, controller.signal);
                if (!controller.signal.aborted) setStatus(value);
            } catch (cause) {
                if (!controller.signal.aborted) {
                    const detail = cause instanceof Error ? cause.message : "读取连接状态失败";
                    setError(detail);
                    setStatus((current) => current ? { ...current, connected: false, message: detail } : null);
                }
            } finally {
                pending = false;
                if (!controller.signal.aborted) {
                    setLoading(false);
                    timer = setTimeout(() => { if (document.visibilityState !== "hidden") void check(); }, 20_000);
                }
            }
        };
        const resume = () => { if (document.visibilityState !== "hidden") void check(); };
        void check();
        window.addEventListener("focus", resume);
        document.addEventListener("visibilitychange", resume);
        return () => {
            controller.abort();
            if (timer) clearTimeout(timer);
            window.removeEventListener("focus", resume);
            document.removeEventListener("visibilitychange", resume);
        };
    }, [open, canvasId, connecting, revoking, refresh]);

    const connect = async () => {
        const controller = new AbortController();
        request.current = controller;
        setConnecting(true);
        setError("");
        try {
            await prepareCanvasForCloudAction(canvasId);
            if (controller.signal.aborted) return;
            const result = await linkAstravia(canvasId, controller.signal);
            if (scope.current !== canvasId) return;
            setStatus(result);
            message.success("已添加到 Astravia，可以在 Astravia 中安排工作");
        } catch (cause) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "连接失败，请检查 Astravia 中的授权提示");
        } finally {
            if (!controller.signal.aborted) setConnecting(false);
        }
    };

    const disconnect = async () => {
        setRevoking(true);
        setError("");
        try {
            if (!status) return;
            const result = await unlinkAstravia(canvasId, status.id);
            if (scope.current === canvasId) {
                setStatus((current) => current ? { ...current, authorized: false, configured: false, connected: false } : null);
                if (result.warning) setError(result.warning);
            }
        } catch (cause) {
            if (scope.current === canvasId) setError(cause instanceof Error ? cause.message : "撤销连接失败");
        } finally { setRevoking(false); }
    };

    const busy = connecting || revoking;
    const connectionLabel = connecting ? "Astravia · 等待授权" : loading && !status ? "Astravia · 正在检查" : status?.connected ? "Astravia · 已连接" : status?.ready ? "Astravia · 待Agent验证" : status?.configured && status.authorized ? "Astravia · 连接暂不可用" : "Astravia · 未连接";
    return <>
        <Tooltip title={connectionLabel} placement="top">
            <button type="button" className={`agent-connector-item${status?.connected ? " agent-connector-item--connected" : ""}`} aria-label={connectionLabel} aria-haspopup="dialog" onClick={() => setOpen(true)}><AstraviaIcon /></button>
        </Tooltip>
        <AppModal title={<span className="inline-flex items-center gap-2"><AstraviaIcon />连接 Astravia</span>} open={open} onCancel={() => { if (!busy) setOpen(false); }} closable={!busy} maskClosable={!busy} keyboard={!busy} centered width={480} footer={null}>
            <div className="space-y-4" data-canvas-no-zoom>
                <p className="text-sm text-muted-foreground">在 Astravia 中安排工作，让境彻在当前画布生成图片、视频和分镜。</p>
                {!canvasId ? <Alert type="info" showIcon title="请先打开一个画布" description="连接只授权当前画布，请进入需要工作的画布后再连接。" /> : <>
                    <Spin spinning={loading}>
                        <div className="space-y-3">
                            <p className="text-sm" role="status">{status?.connected ? "已连接 · Agent 会话已成功通信，无需重复点击连接" : status?.ready ? "境彻服务可达 · 等待 Astravia Agent 会话验证" : status?.configured ? "已添加配置，连接尚不可用" : "尚未连接。请保持 Astravia 桌面版运行，首次连接时确认授权。"}</p>
                            {status?.message && <Alert type="info" showIcon title={status.message} />}
                            <p className="text-xs leading-6 text-muted-foreground">授权范围：当前画布的读取、工作提交与审批。生成使用境彻已有模型渠道并按正常规则计费。Astravia 的 Agent 和 Skills 在 Astravia 内使用；境彻技能可通过工具查询并指定。</p>
                            {status?.connected && <>
                                <p className="text-sm">在 Astravia 中说：“检查境彻连接状态”。它会读取当前画布和可用能力。若当前对话尚未加载新工具，请新建对话，并确认已启用“{status.serverName || "境彻"}”MCP。</p>
                                <p className="text-sm">可以对 Astravia 说：“读取境彻画布和可用模型，用我选定的模型生成分镜图，先告诉我需要的预算。”</p>
                                {status.expiresAt && <p className="text-xs text-muted-foreground">授权有效至 {new Date(status.expiresAt).toLocaleDateString("zh-CN")}。撤销后停止后续访问；已提交的工作需单独取消。</p>}
                            </>}
                        </div>
                    </Spin>
                    {connecting && <Alert type="info" showIcon title="等待 Astravia 授权" description="请切换到 Astravia 确认添加境彻 MCP 服务。完成后此处会更新；若超时，请重新检查连接状态。" />}
                    {error && <Alert type="error" showIcon title={error} />}
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button disabled={busy || loading} icon={<RefreshCw className="size-3.5" />} onClick={() => setRefresh((value) => value + 1)}>检查连接</Button>
                        {status?.authorized && <Button danger disabled={connecting} loading={revoking} onClick={() => void disconnect()}>撤销授权</Button>}
                        {!status?.connected && !status?.ready && <Button type="primary" loading={connecting} disabled={revoking || loading} onClick={() => void connect()}>{status?.authorized ? "恢复连接" : "连接 Astravia"}</Button>}
                    </div>
                </>}
            </div>
        </AppModal>
    </>;
}
