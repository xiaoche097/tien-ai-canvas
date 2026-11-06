import { LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { GenerationTask } from "@/services/api/task-center";
import "./task-progress.css";

export function CommerceTaskProgress({ task, label, onRefresh }: { task?: GenerationTask; label: string; onRefresh: () => Promise<void> }) {
    const [openedAt] = useState(Date.now);
    const [now, setNow] = useState(Date.now);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    const started = Date.parse(task?.startedAt || task?.createdAt || "") || openedAt;
    const seconds = Math.max(0, Math.floor((now - started) / 1000));
    const elapsed = seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
    const detail = !task ? "正在读取服务端任务状态" : task.status === "queued" ? "任务已排队，等待服务端处理" : task.status === "succeeded" ? "模型已返回，正在校验并保存方案" : task.textDraft ? `已收到 ${task.textDraft.length} 字正文，等待完整结果` : "模型处理中，尚未收到正文";
    const refresh = async () => {
        setRefreshing(true);
        setError("");
        try { await onRefresh(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "读取任务状态失败，请重试"); }
        finally { setRefreshing(false); }
    };
    return <div className="ecs-progress commerce-assistant-progress ecs-task-progress" role="status">
        <LoaderCircle className="ecs-task-spinner" size={16} aria-hidden="true" />
        <div className="ecs-task-progress-copy">
            <strong>{label}</strong>
            <span>{detail} · 已等待 {elapsed}</span>
            {seconds >= 120 && !task?.textDraft && task?.status === "running" ? <span>模型响应较慢。刷新状态不会重新提交或重复扣费。</span> : null}
            {error ? <span role="alert">状态读取失败：{error}</span> : null}
        </div>
        <button type="button" disabled={refreshing} onClick={() => void refresh()}><RotateCcw size={13} />{refreshing ? "读取中" : "刷新状态"}</button>
        <Link to="/tasks">任务中心</Link>
    </div>;
}
