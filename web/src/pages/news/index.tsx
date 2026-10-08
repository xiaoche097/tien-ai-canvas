import { ArrowUpRight, CalendarDays, CalendarRange, Clock, ExternalLink, Flame, Newspaper, RefreshCw, Search, Sparkles, TimerReset, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageHeader, WorkspacePage } from "@/components/layout/workspace-page";
import {
    AIHOT_CATEGORY_LABELS,
    callMcpTool,
    fetchCodexMonitor,
    formatAihotTime,
    publicIdFromStoryLink,
    resolveCoverImage,
    type AihotCategory,
    type AihotCodexEvent,
    type AihotCodexReset,
    type AihotDailyReport,
    type AihotItem,
    type AihotPeriodReport,
    type AihotStory,
} from "@/lib/news-mcp";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* 轻量异步数据 Hook：按 deps 变化 + nonce 重取，卸载即作废             */
/* ------------------------------------------------------------------ */
function useAsyncData<T>(fetcher: () => Promise<T>, deps: ReadonlyArray<unknown>): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    const depsKey = JSON.stringify(deps);
    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        fetcherRef
            .current()
            .then((d) => {
                if (alive) {
                    setData(d);
                    setLoading(false);
                }
            })
            .catch((e: unknown) => {
                if (alive) {
                    setError(e instanceof Error ? e.message : String(e));
                    setLoading(false);
                }
            });
        return () => {
            alive = false;
        };
        // depsKey 已序列化全部依赖，nonce 用于手动刷新
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [depsKey, nonce]);

    const reload = useCallback(() => setNonce((n) => n + 1), []);
    return { data, loading, error, reload };
}

/* ------------------------------------------------------------------ */
/* 通用小部件                                                          */
/* ------------------------------------------------------------------ */
type TabId = "hot" | "latest" | "daily" | "weekly" | "monthly" | "codex";

const TABS: { id: TabId; label: string; icon: typeof Flame }[] = [
    { id: "hot", label: "热点", icon: Flame },
    { id: "latest", label: "最新", icon: Clock },
    { id: "daily", label: "日报", icon: CalendarDays },
    { id: "weekly", label: "周报", icon: CalendarRange },
    { id: "monthly", label: "月报", icon: Newspaper },
    { id: "codex", label: "重置监控", icon: TimerReset },
];

const CATEGORY_FILTERS: { value: AihotCategory | ""; label: string }[] = [
    { value: "", label: "全部" },
    { value: "ai-models", label: "模型" },
    { value: "ai-products", label: "产品" },
    { value: "industry", label: "行业" },
    { value: "paper", label: "论文" },
    { value: "tip", label: "技巧" },
];

function LoadingCards({ count = 4 }: { count?: number }) {
    return (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true" aria-label="加载中">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="news-skeleton news-skeleton-card" />
            ))}
        </div>
    );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div className="news-state mt-4">
            <p className="text-sm text-foreground/60">{message}</p>
            {onRetry ? (
                <button type="button" className="news-link mt-1" onClick={onRetry}>
                    重试
                </button>
            ) : null}
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="news-state mt-4">
            <p className="text-sm text-foreground/50">{text}</p>
        </div>
    );
}

function CategoryChip({ category }: { category?: AihotCategory }) {
    if (!category) return null;
    const label = AIHOT_CATEGORY_LABELS[category] ?? category;
    return <span className="news-chip">{label}</span>;
}

/* ------------------------------------------------------------------ */
/* 封面卡片（热点 / 最新 / 搜索结果共用，TapNow 式网格）                 */
/* ------------------------------------------------------------------ */

/** 封面图经 weserv.nl 图片代理转发：源站 og:image 直连在部分网络下会挂起，代理可稳定回源 */
const coverViaProxy = (url: string) => `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`;

function CoverCard({ item, rank, onOpenStory }: { item: AihotItem; rank?: number; onOpenStory?: (publicId: string, title: string) => void }) {
    const storyId = publicIdFromStoryLink(item.links?.story);
    const time = formatAihotTime(item.latestAt) || formatAihotTime(item.publishedAt) || formatAihotTime(item.discoveredAt);
    const [cover, setCover] = useState<string | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        let alive = true;
        setCover(null);
        resolveCoverImage(item.links?.original).then((img) => {
            if (alive) setCover(img);
        });
        return () => {
            alive = false;
        };
    }, [item.links?.original]);

    /* 直连挂起兜底：代理后若 12s 仍未解码成功（既不 load 也不 error），降级为渐变底 */
    useEffect(() => {
        if (!cover) return;
        const timer = window.setTimeout(() => {
            const el = imgRef.current;
            if (!el || !el.complete || el.naturalWidth === 0) setCover(null);
        }, 12000);
        return () => window.clearTimeout(timer);
    }, [cover]);

    const catLabel = item.category ? (AIHOT_CATEGORY_LABELS[item.category] ?? item.category) : "资讯";

    return (
        <article className={cn("news-cover-card", rank != null && "is-rank")}>
            <a className="news-cover" href={item.links?.aihot ?? "#"} target="_blank" rel="noreferrer" aria-label={item.title}>
                {cover ? <img ref={imgRef} className="news-cover-img" src={coverViaProxy(cover)} alt="" referrerPolicy="no-referrer" onError={() => setCover(null)} /> : null}
                <span className={cn("news-cover-grad", item.category && `is-${item.category}`)} aria-hidden>
                    {!cover ? <span className="news-cover-fallback-label">{catLabel}</span> : null}
                </span>
                {rank != null ? (
                    <span className={cn("news-cover-rank", rank <= 3 && "is-top")} aria-label={`第 ${rank} 名`}>
                        {rank}
                    </span>
                ) : null}
                <span className="news-cover-scrim" aria-hidden />
                <div className="news-cover-meta">
                    <CategoryChip category={item.category} />
                    {time ? (
                        <span className="news-cover-time">
                            <Clock className="size-3" aria-hidden />
                            {time}
                        </span>
                    ) : null}
                </div>
            </a>
            <div className="news-cover-body">
                <h3 className="news-card-title news-cover-title">
                    <a href={item.links?.aihot ?? "#"} target="_blank" rel="noreferrer">
                        {item.title}
                    </a>
                </h3>
                <div className="news-cover-footer">
                    {item.source?.name ? (
                        <span className="news-cover-source" title={item.source.name}>
                            {item.source.name}
                        </span>
                    ) : null}
                    <div className="news-card-actions">
                        {item.links?.original ? (
                            <a className="news-link" href={item.links.original} target="_blank" rel="noreferrer">
                                原文
                                <ArrowUpRight className="size-3.5" aria-hidden />
                            </a>
                        ) : null}
                        {storyId && onOpenStory ? (
                            <button type="button" className="news-link" onClick={() => onOpenStory(storyId, item.title ?? "")}>
                                来龙去脉
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </article>
    );
}

/* ------------------------------------------------------------------ */
/* 新闻卡片（日报/周报/月报 分栏列表）                                   */
/* ------------------------------------------------------------------ */
function NewsCard({ item, rank, onOpenStory }: { item: AihotItem; rank?: number; onOpenStory?: (publicId: string, title: string) => void }) {
    const storyId = publicIdFromStoryLink(item.links?.story);
    const time = formatAihotTime(item.latestAt) || formatAihotTime(item.publishedAt) || formatAihotTime(item.discoveredAt);

    return (
        <article className={cn("news-card", rank != null && "is-rank")}>
            {rank != null ? (
                <div className={cn("news-card-rank", rank <= 3 && "is-top")} aria-label={`第 ${rank} 名`}>
                    {rank}
                </div>
            ) : null}
            <div className="min-w-0 flex-1">
                <div className="news-card-meta">
                    <CategoryChip category={item.category} />
                    {item.source?.name ? <span className="news-card-source">{item.source.name}</span> : null}
                    {time ? (
                        <span className="news-card-time">
                            <Clock className="size-3" aria-hidden />
                            {time}
                        </span>
                    ) : null}
                    {item.sourceCount != null ? (
                        <span className="news-card-sources">
                            <ExternalLink className="size-3" aria-hidden />
                            {item.sourceCount} 家来源
                        </span>
                    ) : null}
                </div>
                <h3 className="news-card-title">
                    <a href={item.links?.aihot ?? "#"} target="_blank" rel="noreferrer">
                        {item.title}
                    </a>
                </h3>
                {item.summary ? <p className="news-card-summary">{item.summary}</p> : null}
                {item.reason ? <p className="news-card-reason">推荐理由：{item.reason}</p> : null}
                {(item.links?.original || storyId) && (
                    <div className="news-card-actions">
                        {item.links?.original ? (
                            <a className="news-link" href={item.links.original} target="_blank" rel="noreferrer">
                                查看原文
                                <ArrowUpRight className="size-3.5" aria-hidden />
                            </a>
                        ) : null}
                        {storyId && onOpenStory ? (
                            <button type="button" className="news-link" onClick={() => onOpenStory(storyId, item.title ?? "")}>
                                来龙去脉
                            </button>
                        ) : null}
                    </div>
                )}
            </div>
        </article>
    );
}

/* ------------------------------------------------------------------ */
/* 热点 Tab：Top10                                                     */
/* ------------------------------------------------------------------ */
function HotTab({ onOpenStory, refreshKey }: { onOpenStory: (id: string, title: string) => void; refreshKey: number }) {
    const { data, loading, error, reload } = useAsyncData(async () => {
        const top = await callMcpTool<{ count?: number; items?: AihotItem[] }>("aihot_get_hot_topics", { limit: 10 });
        return Array.isArray(top) ? (top as unknown as AihotItem[]) : (top?.items ?? []);
    }, [refreshKey]);

    if (loading) return <LoadingCards count={5} />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!data || data.length === 0) return <EmptyState text="暂时没有热点数据" />;

    return (
        <div>
            <p className="news-section-title">当前 AIHOT 热点 Top {data.length} · 多个独立信源同时讨论的事件</p>
            <div className="news-grid mt-3">
                {data.map((item, i) => (
                    <CoverCard key={item.id ?? i} item={item} rank={i + 1} onOpenStory={onOpenStory} />
                ))}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 重置监控 Tab（图1 风格：说明 + 统计 + 日历 + 详情）                    */
/* ------------------------------------------------------------------ */
function formatDayZh(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatPostTime(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 事件归属日期：确认/发生/预计窗口起始/创建，取第一个有效日期 */
function eventDay(ev: AihotCodexEvent): string {
    return ev.confirmedAt?.slice(0, 10) ?? ev.occurredOn?.slice(0, 10) ?? ev.schedule?.from?.slice(0, 10) ?? ev.createdAt?.slice(0, 10) ?? "";
}

type DayMark = "done" | "pending" | "wait";

/** 日历标记：已生效（绿）/ 应已生效（橙）/ 已宣布等待生效（蓝） */
function markFor(ev: AihotCodexEvent, today: string): DayMark {
    if (ev.status === "confirmed" || ev.presentation?.status === "confirmed" || ev.confirmedAt) return "done";
    if (ev.status === "announced" || ev.presentation?.status === "in_progress") {
        const through = ev.estimate?.through;
        if (through && today > through.slice(0, 10)) return "pending";
        return "wait";
    }
    return "wait";
}

function CodexTab({ refreshKey }: { refreshKey: number }) {
    const { data, loading, error, reload } = useAsyncData(async () => fetchCodexMonitor(), [refreshKey]);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    if (loading) return <LoadingCards count={4} />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!data || (!data.data && !data.summary)) return <EmptyState text="重置监控暂不可用" />;

    const reset = data.data;
    const summary = data.summary ?? "";
    if (!reset) {
        return (
            <div className="news-state mt-4">
                <p className="text-sm text-foreground/60">AIHOT 暂未提供结构化重置数据，以下为原始摘要：</p>
                <pre className="news-monitor-raw">{summary}</pre>
            </div>
        );
    }

    const events = reset.events ?? [];
    const today = reset.today ?? "";
    const selected = events.find((e) => e.id === selectedId) ?? events[0] ?? null;

    /* ---- 统计：摘要优先，结构化兜底 ---- */
    const mReset = summary.match(/近\s*90\s*天\s*额度重置\s*(\d+)\s*次/);
    const mCard = summary.match(/发\s*重置卡\s*(\d+)\s*次/);
    const mLast = summary.match(/上一次(?:确认的)?\s*额度重置\s*在\s*(\d{4}-\d{2}-\d{2})/);
    const directEvents = events.filter((e) => e.type === "direct_reset" || `${e.displayLabel ?? ""}${e.label ?? ""}`.includes("额度重置"));
    const creditEvents = events.filter((e) => e.type === "reset_credit" || `${e.displayLabel ?? ""}${e.label ?? ""}`.includes("重置卡"));
    const resetCount = mReset ? Number(mReset[1]) : directEvents.length;
    const cardCount = mCard ? Number(mCard[1]) : creditEvents.length;

    let medianDays: number | null = null;
    const ordered = directEvents
        .map((e) => e.confirmedAt ?? e.occurredOn ?? e.createdAt)
        .filter(Boolean)
        .sort() as string[];
    if (ordered.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < ordered.length; i += 1) {
            gaps.push((new Date(ordered[i]).getTime() - new Date(ordered[i - 1]).getTime()) / 86_400_000);
        }
        gaps.sort((a, b) => a - b);
        medianDays = gaps.length % 2 === 1 ? gaps[Math.floor(gaps.length / 2)] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
        medianDays = Math.round(medianDays * 10) / 10;
    }
    const lastReset = mLast?.[1] ?? ordered[ordered.length - 1]?.slice(0, 10) ?? null;

    /* ---- 月历（以 today 所在月为当月，周一开头） ---- */
    const [calY, calM] = today.split("-").slice(0, 2).map(Number);
    const monthStart = new Date(calY, calM - 1, 1);
    const lead = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(calY, calM, 0).getDate();
    const prevDays = new Date(calY, calM - 1, 0).getDate();
    const cells: { day: number; inMonth: boolean; dateKey: string; marks: DayMark[] }[] = [];
    for (let i = 0; i < lead; i += 1) {
        const day = prevDays - lead + i + 1;
        cells.push({ day, inMonth: false, dateKey: `${calY}-${String(calM - 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`, marks: [] });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
        const dateKey = `${calY}-${String(calM).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const marks = events.filter((e) => eventDay(e) === dateKey).map((e) => markFor(e, today));
        cells.push({ day: d, inMonth: true, dateKey, marks });
    }
    while (cells.length % 7 !== 0) {
        const last = cells[cells.length - 1];
        const tailDay = last.day + 1;
        cells.push({
            day: tailDay,
            inMonth: false,
            dateKey: `${calY}-${String(calM + 1).padStart(2, "0")}-${String(tailDay).padStart(2, "0")}`,
            marks: [],
        });
    }

    const monthDirect = directEvents.filter((e) => eventDay(e).startsWith(`${calY}-${String(calM).padStart(2, "0")}`)).length;
    const monthCredit = creditEvents.filter((e) => eventDay(e).startsWith(`${calY}-${String(calM).padStart(2, "0")}`)).length;

    return (
        <div className="news-monitor">
            {/* 顶栏 */}
            <div className="news-monitor-head">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="news-monitor-logo" aria-hidden>
                        <TimerReset className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground">Codex 用量重置监控</h2>
                        <p className="mt-0.5 text-xs text-foreground/50">额度重置与重置卡发放：什么时候生效、给谁、Tibo 原话</p>
                    </div>
                </div>
                <div className="news-monitor-head-side">
                    <span className="news-monitor-tz" title="AIHOT 统一换算">
                        全部为北京时间 · UTC+8
                    </span>
                    {reset.monitor?.status ? <span className={cn("news-chip", reset.monitor.status === "healthy" ? "is-ok" : "is-warn")}>{reset.monitor.status === "healthy" ? "监控正常" : reset.monitor.status}</span> : null}
                </div>
            </div>

            {/* 状态条 */}
            <div className="news-monitor-status">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground/90">
                        {(() => {
                            const waiting = events.find((e) => markFor(e, today) === "wait" || markFor(e, today) === "pending");
                            if (waiting) {
                                return `${waiting.displayLabel ?? waiting.title ?? "重置"} · ${waiting.estimate?.label ?? waiting.schedule?.label ?? "等待生效"}`;
                            }
                            return "当前没有等待生效的重置";
                        })()}
                    </p>
                    <p className="mt-1 text-xs text-foreground/55">
                        上一次重置卡发放：{formatDayZh(creditEvents[0]?.confirmedAt ?? creditEvents[0]?.createdAt) || "暂无"}
                        确认 · 更新于 {formatAihotTime(reset.checkedAt)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-foreground/40">确认帖日期不代表精确到账时间。不预测尚未宣布的下一次重置。Tibo 一旦宣布，这里会显示预计生效时间与原帖。</p>
                </div>
            </div>

            {/* 统计四卡 */}
            <div className="news-monitor-stats">
                <div className="news-monitor-stat">
                    <p className="news-monitor-stat-label">近90天额度重置</p>
                    <p className="news-monitor-stat-value">{resetCount} 次</p>
                </div>
                <div className="news-monitor-stat">
                    <p className="news-monitor-stat-label">近90天发重置卡</p>
                    <p className="news-monitor-stat-value">{cardCount} 次</p>
                </div>
                <div className="news-monitor-stat">
                    <p className="news-monitor-stat-label">重置间隔中位数</p>
                    <p className="news-monitor-stat-value">{medianDays != null ? `${medianDays} 天` : "—"}</p>
                </div>
                <div className="news-monitor-stat">
                    <p className="news-monitor-stat-label">上次额度重置</p>
                    <p className="news-monitor-stat-value">{formatDayZh(lastReset) || "—"}</p>
                </div>
            </div>

            {/* 两栏：日历 + 详情 */}
            <div className="news-monitor-main">
                <section className="news-monitor-cal">
                    <div className="news-monitor-cal-head">
                        <div>
                            <h3 className="text-sm font-medium text-foreground">重置日历</h3>
                            <p className="mt-0.5 text-xs text-foreground/45">点日期查看当天的重置、发卡和 Tibo 原帖</p>
                        </div>
                        <span className="news-chip">
                            {calY} 年 {calM} 月
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-foreground/55">
                        本月 {monthDirect} 次额度重置 · {monthCredit} 次发重置卡
                    </p>
                    <div className="news-monitor-cal-grid" role="grid" aria-label={`${calY}年${calM}月重置日历`}>
                        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
                            <span key={w} className="news-monitor-cal-week" aria-hidden>
                                {w}
                            </span>
                        ))}
                        {cells.map((c, i) => {
                            const isToday = c.dateKey === today;
                            const hasMark = c.marks.length > 0;
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    className={cn("news-monitor-cal-cell", !c.inMonth && "is-out", isToday && "is-today", hasMark && "has-mark")}
                                    aria-label={hasMark ? `${c.dateKey}，${c.marks.length} 条记录` : c.dateKey}
                                    onClick={() => {
                                        if (!hasMark) return;
                                        const first = events.find((e) => eventDay(e) === c.dateKey);
                                        if (first?.id) setSelectedId(first.id);
                                    }}
                                >
                                    <span className="news-monitor-cal-day">{c.day}</span>
                                    {hasMark ? (
                                        <span className="news-monitor-cal-dots" aria-hidden>
                                            {c.marks.slice(0, 3).map((mk, mi) => (
                                                <i key={mi} className={`is-${mk}`} />
                                            ))}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                    <ul className="news-monitor-legend">
                        <li>
                            <i className="is-done" aria-hidden />
                            已生效（官方确认或到账核实）
                        </li>
                        <li>
                            <i className="is-pending" aria-hidden />
                            应已生效（按预计时间，未见确认帖）
                        </li>
                        <li>
                            <i className="is-wait" aria-hidden />
                            已宣布，等待生效
                        </li>
                    </ul>
                </section>

                <section className="news-monitor-detail">
                    {selected ? (
                        (() => {
                            const mark = markFor(selected, today);
                            const pres = selected.presentation;
                            const posts = selected.posts ?? [];
                            return (
                                <div>
                                    <div className="news-monitor-detail-head">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground">
                                                {formatDayZh(eventDay(selected))}
                                                {eventDay(selected) === today ? <span className="text-foreground/45"> · 今天</span> : null}
                                            </p>
                                            <p className="mt-1 text-xs text-foreground/45">
                                                {selected.confirmedAt ? <>确认帖 {formatPostTime(selected.confirmedAt)}（不是精确到账时间）</> : (selected.estimate?.label ?? selected.schedule?.label ?? "预计生效时间未公布")}
                                            </p>
                                        </div>
                                        <span className={cn("news-chip", mark === "done" ? "is-ok" : mark === "pending" ? "is-warn" : "is-info")}>{mark === "done" ? "Tibo 已确认" : mark === "pending" ? "应已生效" : "已宣布，等待生效"}</span>
                                    </div>
                                    <p className="mt-2 text-base font-semibold text-foreground">{selected.title ?? selected.displayLabel ?? selected.label ?? "Codex 重置"}</p>
                                    <p className="mt-1 text-sm text-foreground/65">
                                        适用范围：
                                        {pres?.audienceZh || selected.scope || "未说明"}
                                        {pres?.productsZh ? ` · ${pres.productsZh}` : ""}
                                    </p>

                                    {posts.map((post, pi) => (
                                        <article key={post.id ?? pi} className="news-monitor-tweet">
                                            <div className="news-monitor-tweet-head">
                                                <span className="news-monitor-avatar" aria-hidden>
                                                    <img src="/news-tibo.png" alt="" width={32} height={32} />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium leading-5 text-foreground">
                                                        Tibo
                                                        <span className="ml-1.5 text-xs font-normal text-foreground/45">@thsottiaux</span>
                                                    </p>
                                                    <p className="text-xs text-foreground/45">{post.stage ?? "更新"}</p>
                                                </div>
                                                <a className="news-link ml-auto shrink-0" href={post.url ?? "#"} target="_blank" rel="noreferrer">
                                                    在 X 查看
                                                    <ArrowUpRight className="size-3.5" aria-hidden />
                                                </a>
                                            </div>
                                            {post.text ? <p className="news-monitor-tweet-zh">{post.text}</p> : null}
                                            {post.originalText && post.originalText !== post.text ? (
                                                <p className="news-monitor-tweet-en" lang="en">
                                                    {post.originalText}
                                                </p>
                                            ) : null}
                                            <div className="news-monitor-tweet-foot">
                                                <span>{formatPostTime(post.publishedAt)}</span>
                                                {post.context && post.context.length > 0 ? <span className="text-foreground/45">引用 {post.context.length} 条原帖</span> : null}
                                            </div>
                                        </article>
                                    ))}
                                    {posts.length === 0 ? <p className="mt-3 text-xs text-foreground/45">暂无 Tibo 原帖数据</p> : null}
                                </div>
                            );
                        })()
                    ) : (
                        <p className="text-sm text-foreground/50">暂无重置记录</p>
                    )}
                </section>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 最新 Tab：分类过滤 + 时间窗                                          */
/* ------------------------------------------------------------------ */
function LatestTab({ refreshKey, onOpenStory }: { refreshKey: number; onOpenStory: (id: string, title: string) => void }) {
    const [category, setCategory] = useState<AihotCategory | "">("");
    const [window, setWindow] = useState<"24h" | "7d">("24h");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 9;

    const { data, loading, error, reload } = useAsyncData(async () => {
        const res = await callMcpTool<{ items?: AihotItem[] } | AihotItem[]>("aihot_get_latest", {
            mode: "selected",
            window,
            ...(category ? { category } : {}),
            limit: 20,
        });
        return Array.isArray(res) ? (res as unknown as AihotItem[]) : (res?.items ?? []);
    }, [refreshKey, category, window]);

    const items = data ?? [];
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const visible = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    const goPage = (next: number) => {
        setPage(Math.max(0, Math.min(totalPages - 1, next)));
        requestAnimationFrame(() => {
            const grid = document.querySelector(".news-grid");
            grid?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    };

    return (
        <div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="news-tabbar-pills" role="tablist" aria-label="分类筛选">
                    {CATEGORY_FILTERS.map((c) => (
                        <button
                            key={c.value || "all"}
                            type="button"
                            role="tab"
                            aria-selected={category === c.value}
                            className={cn("news-tab-pill", category === c.value && "is-active")}
                            onClick={() => {
                                setCategory(c.value);
                                setPage(0);
                            }}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
                <div className="news-segmented ml-auto" role="group" aria-label="时间范围">
                    {(["24h", "7d"] as const).map((w) => (
                        <button
                            key={w}
                            type="button"
                            aria-pressed={window === w}
                            className={cn("news-segmented-item", window === w && "is-active")}
                            onClick={() => {
                                setWindow(w);
                                setPage(0);
                            }}
                        >
                            {w === "24h" ? "24 小时" : "7 天"}
                        </button>
                    ))}
                </div>
            </div>
            {loading ? (
                <LoadingCards count={5} />
            ) : error ? (
                <ErrorState message={error} onRetry={reload} />
            ) : !items || items.length === 0 ? (
                <EmptyState text="当前筛选条件下暂无资讯" />
            ) : (
                <>
                    <div className="news-grid mt-3">
                        {visible.map((item, i) => (
                            <CoverCard key={item.id ?? i} item={item} onOpenStory={onOpenStory} />
                        ))}
                    </div>
                    {totalPages > 1 ? (
                        <nav className="news-pager" aria-label="分页">
                            <button type="button" className="news-pager-button" aria-label="上一页" disabled={safePage === 0} onClick={() => goPage(safePage - 1)}>
                                ‹
                            </button>
                            <span className="news-pager-count">
                                {safePage + 1} / {totalPages}
                            </span>
                            <button type="button" className="news-pager-button" aria-label="下一页" disabled={safePage >= totalPages - 1} onClick={() => goPage(safePage + 1)}>
                                ›
                            </button>
                        </nav>
                    ) : null}
                </>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 日报 / 周报 / 月报                                                  */
/* ------------------------------------------------------------------ */
function ReportView({ report }: { report: AihotDailyReport | AihotPeriodReport | null }) {
    if (!report) return null;
    const lead = (report as AihotDailyReport).lead;
    const headline = (report as AihotPeriodReport).headline;
    const overview = (report as AihotPeriodReport).overview;
    const flashes = (report as AihotDailyReport).flashes;
    const sections = report.sections ?? [];

    return (
        <div>
            {lead?.title || headline ? (
                <div className="news-lead">
                    <span className="news-chip">头条</span>
                    <h3 className="mt-2 text-lg font-semibold leading-7 text-foreground">{lead?.title ?? headline}</h3>
                    {lead?.leadParagraph ? <p className="mt-2 text-sm leading-6 text-foreground/70">{lead.leadParagraph}</p> : null}
                    {overview ? <p className="mt-2 text-sm leading-6 text-foreground/70">{overview}</p> : null}
                </div>
            ) : null}
            {sections.map((section, si) => (
                <section key={section.label ?? si} className="mt-5">
                    <h3 className="news-section-title">{section.label}</h3>
                    <div className="mt-2 flex flex-col gap-3">
                        {(section.items ?? []).map((item, i) => (
                            <NewsCard key={item.id ?? i} item={item} />
                        ))}
                    </div>
                </section>
            ))}
            {flashes && flashes.length > 0 ? (
                <section className="mt-5">
                    <h3 className="news-section-title">快讯</h3>
                    <ul className="mt-2 flex flex-col rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)]">
                        {flashes.map((f, i) => (
                            <li key={f.id ?? i} className="flex min-w-0 items-baseline gap-3 border-b border-[var(--workspace-border)] px-4 py-3 last:border-b-0">
                                <span className="shrink-0 font-mono text-xs text-foreground/45">{formatAihotTime(f.publishedAt)}</span>
                                <a className="min-w-0 flex-1 truncate text-sm text-foreground/82 hover:text-foreground" href={f.links?.aihot ?? "#"} target="_blank" rel="noreferrer">
                                    {f.title}
                                </a>
                                {f.source?.name ? <span className="hidden shrink-0 text-xs text-foreground/40 sm:block">{f.source.name}</span> : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}

function DailyTab({ refreshKey }: { refreshKey: number }) {
    const { data, loading, error, reload } = useAsyncData(async () => {
        const res = await callMcpTool<{ report?: AihotDailyReport } | AihotDailyReport>("aihot_get_daily", {});
        return (res as { report?: AihotDailyReport }).report ?? (res as AihotDailyReport);
    }, [refreshKey]);
    if (loading) return <LoadingCards count={4} />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!data) return <EmptyState text="日报暂不可用" />;
    return (
        <div>
            <p className="text-xs text-foreground/45">日报 {data.date ?? ""} · 每日 08:00 发布，收录北京时间上一日 08:00 至当日 08:00 的动态</p>
            <div className="mt-1">
                <ReportView report={data} />
            </div>
        </div>
    );
}

function PeriodTab({ kind, refreshKey }: { kind: "weekly" | "monthly"; refreshKey: number }) {
    const { data, loading, error, reload } = useAsyncData(async () => {
        const res = await callMcpTool<{ report?: AihotPeriodReport } | AihotPeriodReport>(kind === "weekly" ? "aihot_get_weekly" : "aihot_get_monthly", {});
        return (res as { report?: AihotPeriodReport }).report ?? (res as AihotPeriodReport);
    }, [refreshKey, kind]);
    if (loading) return <LoadingCards count={4} />;
    if (error) return <ErrorState message={error} onRetry={reload} />;
    if (!data) return <EmptyState text={`${kind === "weekly" ? "周报" : "月报"}暂不可用`} />;
    const period = kind === "weekly" ? data.week : data.month;
    return (
        <div>
            <p className="text-xs text-foreground/45">{kind === "weekly" ? `周报 · ${period ?? ""}` : `月报 · ${period ?? ""}`}</p>
            <div className="mt-1">
                <ReportView report={data} />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 搜索视图                                                            */
/* ------------------------------------------------------------------ */
function SearchResults({
    q,
    data,
    loading,
    error,
    onClear,
    onRetry,
    onOpenStory,
}: {
    q: string;
    data: AihotItem[] | null;
    loading: boolean;
    error: string | null;
    onClear: () => void;
    onRetry: () => void;
    onOpenStory: (id: string, title: string) => void;
}) {
    return (
        <div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-sm text-foreground/65">
                    搜索“<span className="text-foreground">{q}</span>”的精选结果
                    {data ? <span className="text-foreground/45"> · {data.length} 条</span> : null}
                </p>
                <button type="button" className="news-link" onClick={onClear}>
                    <X className="size-3.5" aria-hidden />
                    清除搜索
                </button>
            </div>
            {loading ? (
                <LoadingCards count={4} />
            ) : error ? (
                <ErrorState message={error} onRetry={onRetry} />
            ) : !data || data.length === 0 ? (
                <EmptyState text="没有找到相关资讯，换个关键词试试" />
            ) : (
                <div className="news-grid mt-3">
                    {data.map((item, i) => (
                        <CoverCard key={item.id ?? i} item={item} onOpenStory={onOpenStory} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 故事详情抽屉（aihot_get_story）                                     */
/* ------------------------------------------------------------------ */
function StoryDrawer({ story, onClose }: { story: { id: string; title: string; data: AihotStory | null; loading: boolean; error: string | null }; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const s = story.data;
    return (
        <div className="news-drawer" role="dialog" aria-modal="true" aria-label="故事详情">
            <button type="button" className="news-drawer-scrim" aria-label="关闭" onClick={onClose} />
            <div className="news-drawer-panel">
                <div className="news-drawer-head">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{story.title}</p>
                        {s ? (
                            <p className="mt-0.5 text-xs text-foreground/50">
                                {s.sourceCount ?? 0} 家来源 · 时间线 {s.reportCount ?? 0} 条{s.status ? ` · ${s.status}` : ""}
                            </p>
                        ) : null}
                    </div>
                    <button type="button" className="news-drawer-close" aria-label="关闭" onClick={onClose}>
                        <X className="size-4" aria-hidden />
                    </button>
                </div>
                <div className="news-drawer-body">
                    {story.loading ? (
                        <LoadingCards count={3} />
                    ) : story.error ? (
                        <ErrorState message={story.error} />
                    ) : s ? (
                        <div>
                            {s.latest ? (
                                <section className="news-drawer-block">
                                    <h4 className="news-drawer-block-title">
                                        <Sparkles className="size-3.5" aria-hidden />
                                        最新进展
                                    </h4>
                                    <p className="text-sm leading-6 text-foreground/80">{s.latest}</p>
                                </section>
                            ) : null}
                            {s.digest ? (
                                <section className="news-drawer-block">
                                    <h4 className="news-drawer-block-title">
                                        <Sparkles className="size-3.5" aria-hidden />
                                        AI 摘要
                                    </h4>
                                    <p className="text-sm leading-6 text-foreground/75">{s.digest}</p>
                                </section>
                            ) : null}
                            {s.reports && s.reports.length > 0 ? (
                                <section className="news-drawer-block">
                                    <h4 className="news-drawer-block-title">
                                        <Clock className="size-3.5" aria-hidden />
                                        事件时间线
                                    </h4>
                                    <ol className="news-timeline">
                                        {s.reports.map((r, i) => (
                                            <li key={r.id ?? i} className="news-timeline-item">
                                                <span className="news-timeline-dot" aria-hidden />
                                                <div className="min-w-0 flex-1 pb-5">
                                                    <p className="text-xs text-foreground/45">
                                                        {formatAihotTime(r.publishedAt)}
                                                        {r.source?.name ? ` · ${r.source.name}` : ""}
                                                    </p>
                                                    <p className="mt-1 text-sm font-medium leading-5 text-foreground/88">{r.title}</p>
                                                    {r.summary ? <p className="mt-1 text-sm leading-6 text-foreground/65">{r.summary}</p> : null}
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            ) : null}
                            {s.storyline && s.storyline.length > 0 ? (
                                <section className="news-drawer-block">
                                    <h4 className="news-drawer-block-title">
                                        <Flame className="size-3.5" aria-hidden />
                                        来龙去脉
                                    </h4>
                                    <ul className="flex flex-col gap-1.5">
                                        {s.storyline.map((line, i) => (
                                            <li key={i} className="text-sm leading-6 text-foreground/75">
                                                {line}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                            {s.related && s.related.length > 0 ? (
                                <section className="news-drawer-block">
                                    <h4 className="news-drawer-block-title">
                                        <ExternalLink className="size-3.5" aria-hidden />
                                        相关事件
                                    </h4>
                                    <ul className="flex flex-col gap-1.5">
                                        {s.related.map((r, i) => (
                                            <li key={r.publicId ?? i}>
                                                <a className="news-related-link" href={r.links?.aihot ?? "#"} target="_blank" rel="noreferrer">
                                                    {r.title}
                                                    <ArrowUpRight className="size-3.5" aria-hidden />
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* 资讯页主体                                                          */
/* ------------------------------------------------------------------ */
export default function NewsPage() {
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const [activeTab, setActiveTab] = useState<TabId>("hot");
    const [refreshKey, setRefreshKey] = useState(0);
    const [query, setQuery] = useState("");
    const [searchState, setSearchState] = useState<{
        q: string;
        data: AihotItem[] | null;
        loading: boolean;
        error: string | null;
        nonce: number;
    }>({ q: "", data: null, loading: false, error: null, nonce: 0 });

    const [story, setStory] = useState<{
        id: string;
        title: string;
        data: AihotStory | null;
        loading: boolean;
        error: string | null;
    } | null>(null);

    const openStory = useCallback((id: string, title: string) => {
        setStory({ id, title, data: null, loading: true, error: null });
    }, []);

    useEffect(() => {
        if (!story || story.data || story.error) return;
        let alive = true;
        callMcpTool<{ story?: AihotStory }>("aihot_get_story", {
            public_id: story.id,
            report_limit: 20,
        })
            .then((res) => {
                if (alive) setStory((prev) => (prev ? { ...prev, data: (res as { story?: AihotStory }).story ?? null, loading: false } : prev));
            })
            .catch((e: unknown) => {
                if (alive) setStory((prev) => (prev ? { ...prev, error: e instanceof Error ? e.message : String(e), loading: false } : prev));
            });
        return () => {
            alive = false;
        };
    }, [story]);

    const runSearch = useCallback((q: string) => {
        const trimmed = q.trim();
        if (trimmed.length < 2) return;
        setSearchState((prev) => ({ q: trimmed, data: null, loading: true, error: null, nonce: prev.nonce }));
    }, []);

    useEffect(() => {
        if (!searchState.q || !searchState.loading) return;
        let alive = true;
        callMcpTool<{ items?: AihotItem[] } | AihotItem[]>("aihot_search", {
            q: searchState.q,
            window: "7d",
            limit: 20,
        })
            .then((res) => {
                const items = Array.isArray(res) ? (res as unknown as AihotItem[]) : (res?.items ?? []);
                if (alive) setSearchState((prev) => (prev.q ? { ...prev, data: items, loading: false } : prev));
            })
            .catch((e: unknown) => {
                if (alive) setSearchState((prev) => (prev.q ? { ...prev, error: e instanceof Error ? e.message : String(e), loading: false } : prev));
            });
        return () => {
            alive = false;
        };
    }, [searchState.q, searchState.loading, searchState.nonce]);

    const searching = searchState.q !== "";
    const onOpenStory = useCallback((id: string, title: string) => openStory(id, title), [openStory]);

    return (
        <WorkspacePage className="news-page">
            <div className="w-full">
                <PageHeader
                    title="资讯"
                    description={`${brandName} · AI 前沿情报聚合，内容来自 AIHOT，仅作资讯参考`}
                    meta={
                        <span className="news-chip" title="数据来源">
                            AIHOT
                        </span>
                    }
                    actions={
                        <>
                            <div className="news-search">
                                <Search className="size-4 text-foreground/45" aria-hidden />
                                <input
                                    type="search"
                                    value={query}
                                    placeholder="搜索模型 / 产品 / 话题…"
                                    aria-label="搜索资讯"
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") runSearch(query);
                                    }}
                                />
                                {searching ? (
                                    <button
                                        type="button"
                                        className="news-search-clear"
                                        aria-label="清除搜索"
                                        onClick={() => {
                                            setQuery("");
                                            setSearchState((prev) => ({ q: "", data: null, loading: false, error: null, nonce: prev.nonce }));
                                        }}
                                    >
                                        <X className="size-3.5" aria-hidden />
                                    </button>
                                ) : null}
                            </div>
                            <button type="button" className="news-icon-btn" aria-label="刷新" title="刷新" onClick={() => setRefreshKey((k) => k + 1)}>
                                <RefreshCw className="size-4" aria-hidden />
                            </button>
                        </>
                    }
                />

                <section className="news-hero" aria-label="资讯头条">
                    <video className="news-hero-video" src="/news-hero.mp4" autoPlay muted loop playsInline preload="metadata" aria-hidden />
                    <span className="news-hero-scrim" aria-hidden />
                    <span className="news-hero-vignette" aria-hidden />
                    <div className="news-hero-body">
                        <p className="news-hero-kicker">AIHOT · 多源聚合 · 每日更新</p>
                        <h2 className="news-hero-title">洞见 AI 前沿，先人一步</h2>
                        <p className="news-hero-sub">模型 · 产品 · 行业 · 论文 · 技巧，跨信源交叉验证</p>
                    </div>
                </section>

                {!searching ? (
                    <div className="news-body">
                        <nav className="news-tabs" aria-label="资讯栏目">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                return (
                                    <button key={tab.id} type="button" aria-current={activeTab === tab.id ? "page" : undefined} className={cn("news-tab", activeTab === tab.id && "is-active")} onClick={() => setActiveTab(tab.id)}>
                                        <Icon className="size-4" aria-hidden />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                ) : null}

                {searching ? (
                    <div className="news-body">
                        <SearchResults
                            q={searchState.q}
                            data={searchState.data}
                            loading={searchState.loading}
                            error={searchState.error}
                            onClear={() => {
                                setQuery("");
                                setSearchState((prev) => ({ q: "", data: null, loading: false, error: null, nonce: prev.nonce }));
                            }}
                            onRetry={() => setSearchState((prev) => ({ ...prev, loading: true, error: null, nonce: prev.nonce + 1 }))}
                            onOpenStory={onOpenStory}
                        />
                    </div>
                ) : (
                    <div className="news-body mt-3">
                        {activeTab === "hot" ? <HotTab onOpenStory={onOpenStory} refreshKey={refreshKey} /> : null}
                        {activeTab === "latest" ? <LatestTab refreshKey={refreshKey} onOpenStory={onOpenStory} /> : null}
                        {activeTab === "daily" ? <DailyTab refreshKey={refreshKey} /> : null}
                        {activeTab === "weekly" ? <PeriodTab kind="weekly" refreshKey={refreshKey} /> : null}
                        {activeTab === "monthly" ? <PeriodTab kind="monthly" refreshKey={refreshKey} /> : null}
                        {activeTab === "codex" ? <CodexTab refreshKey={refreshKey} /> : null}
                    </div>
                )}

                <p className="mt-6 text-xs text-foreground/35">内容由 AIHOT 自动聚合自外部公开信源，仅供资讯参考；重要事实请以原文链接为准。</p>
            </div>

            {story ? <StoryDrawer story={story} onClose={() => setStory(null)} /> : null}
        </WorkspacePage>
    );
}
