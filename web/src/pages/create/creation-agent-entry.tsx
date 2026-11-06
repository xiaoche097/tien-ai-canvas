import { useTranslation } from "react-i18next";
import { CreationTypewriter, creationAgentHeading } from "./creation-typewriter";
import { useRef, useState } from "react";
import { App, Button } from "antd";
import { ArrowUpRight, FolderOpen, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useUserStore } from "@/stores/use-user-store";
import { createCanvasProjectWithRemoteSync, hasRemoteUserDataSyncSession, saveRemoteUserDataNow } from "@/services/user-data-sync";

/** Agent 依赖真实画布 ID，先完成服务端保存，再进入同一个画布 Agent。 */
export function CreationAgentEntry() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { message } = App.useApp();
    const hydrated = useCanvasStore((state) => state.hydrated);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const created = useRef<{ id: string; userId: string } | null>(null);
    const start = async () => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        const userId = useUserStore.getState().user?.id;
        try {
            if (!userId || !hasRemoteUserDataSyncSession()) throw new Error(t("create.agentEntry.sessionNotReady"));
            if (!hydrated) throw new Error(t("create.agentEntry.canvasRestoring"));
            if (created.current?.userId !== userId) created.current = null;
            if (!created.current) {
                const result = await createCanvasProjectWithRemoteSync(t("create.agentEntry.canvasTitle"));
                if (!result.id) throw new Error(t("create.agentEntry.missingId"));
                created.current = { id: result.id, userId };
                if (result.syncError) throw new Error(t("create.agentEntry.syncPending"));
            } else {
                await saveRemoteUserDataNow(created.current.id);
            }
            if (useUserStore.getState().user?.id !== userId) return;
            navigate(`/canvas/${encodeURIComponent(created.current.id)}?agent=1`);
        } catch (cause) {
            if (useUserStore.getState().user?.id === userId) {
                const detail = cause instanceof Error ? cause.message : t("create.agentEntry.startFailed");
                setError(detail);
                message.error(detail);
            }
        } finally { lock.current = false; setBusy(false); }
    };
    return <section className="creation-agent-entry" aria-label="画布 Agent 模式">
        <div className="creation-agent-orb" aria-hidden="true">
            <img className="is-dark" src={`${import.meta.env.BASE_URL}jingche-agent-dark.png`} alt="" width={72} height={72} />
            <img className="is-light" src={`${import.meta.env.BASE_URL}jingche-agent-light.png`} alt="" width={72} height={72} />
        </div>
        <div className="creation-agent-copy"><span className="creation-agent-eyebrow">CANVAS AGENT</span><h2 aria-label={creationAgentHeading[0]}><CreationTypewriter messages={creationAgentHeading} loop={false} /></h2><p>使用画布里的同一个 Agent，结合素材、技能与创作上下文协作。生成与修改仍需经过原有审批和额度检查。</p></div>
        <div className="creation-agent-actions"><Button type="primary" icon={<ArrowRight />} loading={busy} disabled={!hydrated} onClick={() => void start()}>{created.current ? "重试同步并进入" : "新建画布，与 Agent 创作"}<ArrowUpRight /></Button><Button icon={<FolderOpen />} disabled={busy} onClick={() => navigate("/canvas?agent=1")}>在已有画布中继续</Button></div>
        {error ? <p className="creation-agent-error" role="alert">{error}</p> : null}
    </section>;
}
