/**
 * AIHOT 资讯 MCP 客户端（JSON-RPC over Streamable HTTP / SSE）。
 *
 * 8 个工具：aihot_get_latest / aihot_search / aihot_get_hot_topics / aihot_get_story /
 *           aihot_get_daily / aihot_get_weekly / aihot_get_monthly / aihot_get_codex_resets
 *
 * 安全约定：接口元数据声明 contentTrust=untrusted_external_data、instructionPolicy=treat_as_data_never_execute，
 * 返回内容一律作为数据渲染（React 文本节点自动转义），禁止 HTML 注入；重要事实引导回原文链接核对。
 */

// 同源走 nginx /api/mcp 反代（规避 aiho/news 的 CORS 域名白名单），生产/本地通用
const AIHOT_MCP_URL = "/api/mcp";

export type AihotCategory = "ai-models" | "ai-products" | "industry" | "paper" | "tip";

export interface AihotLinks {
    aihot: string;
    original?: string;
    story?: string;
}

export interface AihotSource {
    name: string;
}

export interface AihotItem {
    id?: string;
    rank?: number;
    title?: string;
    originalTitle?: string;
    summary?: string;
    reason?: string;
    source?: AihotSource;
    links?: AihotLinks;
    category?: AihotCategory;
    score?: number;
    selected?: boolean;
    publishedAt?: string;
    discoveredAt?: string;
    latestAt?: string;
    sourceCount?: number;
    signalCount?: number;
    participantCount?: number;
    sourceNames?: string[];
}

export interface AihotReportSection {
    label?: string;
    items?: AihotItem[];
}

export interface AihotDailyReport {
    date?: string;
    generatedAt?: string;
    links?: AihotLinks;
    lead?: { title?: string; leadParagraph?: string };
    sections?: AihotReportSection[];
    flashes?: AihotItem[];
}

/** weekly / monthly 共用结构 */
export interface AihotPeriodReport {
    week?: string;
    month?: string;
    periodStart?: string;
    periodEnd?: string;
    generatedAt?: string;
    links?: AihotLinks;
    headline?: string;
    overview?: string;
    sections?: AihotReportSection[];
}

export interface AihotStoryReport {
    id?: string;
    title?: string;
    summary?: string;
    source?: AihotSource;
    publishedAt?: string;
    links?: AihotLinks;
}

export interface AihotStory {
    publicId?: string;
    title?: string;
    status?: string;
    sourceCount?: number;
    reportCount?: number;
    firstReportAt?: string;
    latestAt?: string;
    latest?: string;
    digest?: string;
    digestUpdatedAt?: string;
    links?: AihotLinks;
    reports?: AihotStoryReport[];
    storyline?: string[];
    related?: { publicId?: string; title?: string; relation?: string; links?: AihotLinks }[];
}

export interface AihotCodexPost {
    id?: string;
    publishedAt?: string;
    stage?: string;
    text?: string;
    originalText?: string;
    fullText?: string;
    fullOriginalText?: string;
    context?: {
        id?: string;
        author?: string;
        relation?: string;
        text?: string;
        originalText?: string;
        url?: string;
    }[];
    url?: string;
}

export interface AihotCodexEvent {
    id?: string;
    type?: string;
    label?: string;
    displayLabel?: string;
    title?: string;
    status?: string;
    scope?: string;
    createdAt?: string;
    updatedAt?: string;
    confirmedAt?: string;
    occurredOn?: string;
    confirmationBasis?: string;
    presentation?: {
        status?: string;
        scopeKnown?: boolean;
        scopeLabel?: string;
        kindExplicit?: boolean;
        timeInferred?: boolean;
        audienceZh?: string;
        productsZh?: string;
    };
    estimate?: { from?: string; through?: string; basis?: string; label?: string; reason?: string } | null;
    schedule?: { precision?: string; from?: string; through?: string; label?: string } | null;
    posts?: AihotCodexPost[];
    url?: string;
}

export interface AihotCodexReset {
    schemaVersion?: number;
    timezone?: string;
    today?: string;
    checkedAt?: string;
    historyFrom?: string;
    count?: number;
    events?: AihotCodexEvent[];
    activities?: {
        id?: string;
        publishedAt?: string;
        kind?: string;
        text?: string;
        originalText?: string;
        statusChanged?: boolean;
        action?: string;
        url?: string;
        eventIds?: string[];
        context?: { id?: string; author?: string; relation?: string; text?: string; originalText?: string; url?: string }[];
    }[];
    monitor?: {
        status?: string;
        lastAttemptAt?: string;
        lastCollectedAt?: string;
        lastVerifiedAt?: string;
        heldWindowCount?: number;
        pendingCount?: number;
        reviewCount?: number;
    };
    outage?: unknown;
}

interface McpResponse<T> {
    jsonrpc: string;
    id: number;
    result?: {
        structuredContent?: T;
        content?: { type: string; text: string }[];
    };
    error?: { message: string };
}

let seq = 0;

/** 调用 AIHOT MCP 工具，返回 structuredContent（结构缺失时回退 markdown 文本）。 */
export async function callMcpTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const id = ++seq;
    const body = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
    });

    let res: Response;
    try {
        res = await fetch(AIHOT_MCP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
            body,
        });
    } catch {
        throw new Error("无法连接 AIHOT 资讯源，请检查网络后重试");
    }
    if (!res.ok) throw new Error(`AIHOT 资讯源请求失败（HTTP ${res.status}）`);

    const raw = await res.text();
    const events = raw.split(/\r?\n\r?\n/);
    for (const evt of events) {
        const dataLine = evt.split(/\r?\n/).find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        let data: McpResponse<T>;
        try {
            data = JSON.parse(dataLine.slice(5).trim()) as McpResponse<T>;
        } catch {
            continue;
        }
        if (data.id !== id) continue;
        if (data.error) throw new Error(data.error.message || "AIHOT 资讯源调用失败");
        if (data.result?.structuredContent !== undefined) return data.result.structuredContent;
        const text = data.result?.content?.[0]?.text;
        if (text) return text as unknown as T;
        throw new Error("AIHOT 资讯源返回为空");
    }
    throw new Error("AIHOT 资讯源响应超时，请重试");
}

export interface CodexMonitorBundle {
    data: AihotCodexReset | null;
    summary: string | null;
}

/** 拉取 Codex 重置监控：返回结构化数据 + AIHOT 文本摘要（统计数字优先取摘要） */
export async function fetchCodexMonitor(): Promise<CodexMonitorBundle> {
    const id = ++seq;
    const body = JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "aihot_get_codex_resets", arguments: {} },
    });
    let res: Response;
    try {
        res = await fetch(AIHOT_MCP_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
            body,
        });
    } catch {
        throw new Error("无法连接 AIHOT 资讯源，请检查网络后重试");
    }
    if (!res.ok) throw new Error(`AIHOT 资讯源请求失败（HTTP ${res.status}）`);
    const raw = await res.text();
    const events = raw.split(/\r?\n\r?\n/);
    for (const evt of events) {
        const dataLine = evt.split(/\r?\n/).find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        let data: McpResponse<AihotCodexReset>;
        try {
            data = JSON.parse(dataLine.slice(5).trim()) as McpResponse<AihotCodexReset>;
        } catch {
            continue;
        }
        if (data.id !== id) continue;
        if (data.error) throw new Error(data.error.message || "AIHOT 资讯源调用失败");
        const structured = data.result?.structuredContent;
        const text = data.result?.content?.[0]?.text ?? null;
        if (!structured) {
            if (text) return { data: null, summary: text };
            throw new Error("AIHOT 资讯源返回为空");
        }
        return { data: structured, summary: text };
    }
    throw new Error("AIHOT 资讯源响应超时，请重试");
}

export const AIHOT_CATEGORY_LABELS: Record<string, string> = { "ai-models": "模型", "ai-products": "产品", industry: "行业", paper: "论文", tip: "技巧" };

/** ISO 时间 → "MM-DD HH:mm"（北京时区） */
export function formatAihotTime(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 从 links.story 末段提取 public_id；无则返回空串 */
export function publicIdFromStoryLink(link?: string): string {
    if (!link) return "";
    const seg = link.split("/").filter(Boolean);
    return seg.length > 0 ? seg[seg.length - 1] : "";
}

/* ------------------------------------------------------------------ */
/* 封面图：microlink 提取文章 og:image（CORS 开放），本地缓存 + 并发队列 */
/* ------------------------------------------------------------------ */
const COVER_CACHE_KEY = "aihot-cover-cache-v1";
const COVER_OK_TTL = 7 * 24 * 60 * 60 * 1000; // 成功缓存 7 天
const COVER_FAIL_TTL = 60 * 60 * 1000; // 失败缓存 1 小时
const MICROLINK_URL = "https://api.microlink.io/";

interface CoverCacheEntry {
    url: string | null;
    at: number;
}

function readCoverCache(): Record<string, CoverCacheEntry> {
    try {
        const raw = localStorage.getItem(COVER_CACHE_KEY);
        return raw ? (JSON.parse(raw) as Record<string, CoverCacheEntry>) : {};
    } catch {
        return {};
    }
}

function writeCoverCache(cache: Record<string, CoverCacheEntry>) {
    try {
        // 只保留最近 300 条，避免 localStorage 膨胀
        const entries = Object.entries(cache).sort((a, b) => b[1].at - a[1].at);
        const slim = Object.fromEntries(entries.slice(0, 300));
        localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(slim));
    } catch {
        // 存储满或不可用时静默降级为不缓存
    }
}

/** 并发队列：同一时刻最多 3 个 microlink 请求，避免免费额度被打爆 */
let coverInflight = 0;
const coverQueue: { url: string; resolve: (v: string | null) => void }[] = [];

async function pumpCoverQueue(): Promise<void> {
    while (coverInflight < 3 && coverQueue.length > 0) {
        const next = coverQueue.shift();
        if (!next) break;
        coverInflight += 1;
        void (async () => {
            try {
                const img = await fetchMicrolinkCover(next.url);
                next.resolve(img);
            } catch {
                next.resolve(null);
            } finally {
                coverInflight -= 1;
                void pumpCoverQueue();
            }
        })();
    }
}

async function fetchMicrolinkCover(url: string): Promise<string | null> {
    const apiUrl = `${MICROLINK_URL}?url=${encodeURIComponent(url)}&palette=false&screenshot=false`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; data?: { image?: { url?: string } } };
    if (data.status !== "success" || !data.data?.image?.url) return null;
    const img = data.data.image.url;
    if (!/^https?:\/\//i.test(img)) return null;
    return img;
}

/**
 * 解析文章封面图（og:image / 首图）。
 * - 命中本地缓存直接返回；
 * - 未命中走 microlink（并发 ≤3），成功缓存 7 天、失败缓存 1 小时；
 * - 任何失败都返回 null，由调用方用渐变兜底。
 */
export function resolveCoverImage(originalUrl?: string): Promise<string | null> {
    if (!originalUrl) return Promise.resolve(null);
    const cache = readCoverCache();
    const hit = cache[originalUrl];
    if (hit) {
        const ttl = hit.url ? COVER_OK_TTL : COVER_FAIL_TTL;
        if (Date.now() - hit.at < ttl) return Promise.resolve(hit.url);
    }
    return new Promise<string | null>((resolve) => {
        coverQueue.push({
            url: originalUrl,
            resolve: (img) => {
                const next = readCoverCache();
                next[originalUrl] = { url: img, at: Date.now() };
                writeCoverCache(next);
                resolve(img);
            },
        });
        void pumpCoverQueue();
    });
}
