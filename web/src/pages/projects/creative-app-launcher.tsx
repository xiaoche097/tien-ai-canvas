import { useRef, useState } from "react";
import { Button, Input } from "antd";
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router";
import { AppModal } from "@/components/ui/product/app-modal";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession, saveRemoteUserDataNow } from "@/services/user-data-sync";
import type { CreativeApplication } from "./creative-apps";

export function CreativeAppLauncher({ application, onClose }: { application: CreativeApplication; onClose: () => void }) {
    const navigate = useNavigate();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const [brief, setBrief] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const created = useRef<{ id: string; userId: string } | null>(null);
    const start = async () => {
        if (lock.current || !brief.trim()) return;
        lock.current = true;
        setBusy(true);
        setError("");
        const userId = useUserStore.getState().user?.id;
        try {
            if (!userId || !hasRemoteUserDataSyncSession()) throw new Error("登录与云端同步尚未就绪，请稍后重试。");
            if (!hydrated) throw new Error("画布还在恢复中，请稍后重试。");
            if (created.current?.userId !== userId) created.current = null;
            if (!created.current) {
                const result = await createCanvasProjectWithRemoteSync(application.title);
                if (!result.id) throw new Error("画布创建未返回有效 ID，请重试。");
                created.current = { id: result.id, userId };
                if (result.syncError) throw new Error("画布已保留在本机，云端保存失败。重试会继续同步同一画布。");
            } else {
                await saveRemoteUserDataNow(created.current.id);
            }
            if (useUserStore.getState().user?.id !== userId) return;
            navigate(`/canvas/${encodeURIComponent(created.current.id)}`, {
                state: { creativeCenterAgent: { canvasId: created.current.id, userId, prompt: `${application.instructions}\n\n我的创作需求：\n${brief.trim()}` } },
            });
        } catch (cause) {
            if (useUserStore.getState().user?.id === userId) setError(cause instanceof Error ? cause.message : "启动失败，请重试。");
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const Icon = application.icon;
    return (
        <AppModal
            open
            title={application.title}
            onCancel={() => {
                if (!busy) onClose();
            }}
            maskClosable={!busy}
            closable={!busy}
            keyboard={!busy}
            footer={null}
            width={600}
        >
            <div className="creative-app-launcher">
                <div className="creative-app-launcher-intro">
                    <Icon aria-hidden />
                    <p>{application.description}</p>
                </div>
                <label htmlFor="creative-app-brief">这次想做什么？</label>
                <Input.TextArea id="creative-app-brief" autoFocus value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={application.placeholder} autoSize={{ minRows: 5, maxRows: 9 }} maxLength={8000} disabled={busy} />
                <p className="creative-app-launcher-note">进入画布后可上传参考素材、选择模型和技能。需求会预填到 Agent，确认后再发送。</p>
                {error ? (
                    <p className="creative-app-launcher-error" role="alert">
                        {error}
                    </p>
                ) : null}
                <div className="creative-app-launcher-actions">
                    <Button disabled={busy} onClick={onClose}>
                        取消
                    </Button>
                    <Button type="primary" icon={<ArrowUpRight />} loading={busy} disabled={!brief.trim() || !hydrated} onClick={() => void start()}>
                        {created.current ? "重试同步并进入" : "进入 Agent 创作"}
                    </Button>
                </div>
            </div>
        </AppModal>
    );
}
