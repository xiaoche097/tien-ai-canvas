import { ArrowUpRight, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { AIHOT_CATEGORY_LABELS, callMcpTool, formatAihotTime, publicIdFromStoryLink, resolveCoverImage, type AihotItem, type AihotReportSection, type AihotStory } from "@/lib/news-mcp";
import "./news-editorial.css";

type OpenStory = (id: string, title: string) => void;

export function NewsImage({ item }: { item: AihotItem }) {
    const [image, setImage] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const [direct, setDirect] = useState(false);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true;
        setImage(null);
        setFailed(false);
        setDirect(false);
        setLoading(true);
        resolveCoverImage(item.links?.original).then((url) => {
            if (alive) {
                setImage(url);
                setLoading(false);
            }
        });
        return () => {
            alive = false;
        };
    }, [item.links?.original]);
    return (
        <div className="news-editorial-image">
            {image && !failed ? (
                <img
                    src={direct ? image : `https://images.weserv.nl/?url=${encodeURIComponent(image.replace(/^https?:\/\//, ""))}`}
                    alt={item.title ?? "资讯配图"}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => (direct ? setFailed(true) : setDirect(true))}
                />
            ) : (
                <div className="news-editorial-image-fallback">
                    <ImageIcon aria-hidden />
                    <span>{item.source?.name ?? "AIHOT"}</span>
                    <small>{loading ? "配图加载中" : "原文配图暂不可用"}</small>
                </div>
            )}
        </div>
    );
}

function ArticleTitle({ item, onOpenStory }: { item: AihotItem; onOpenStory?: OpenStory }) {
    const id = publicIdFromStoryLink(item.links?.story);
    return id && onOpenStory ? (
        <button type="button" onClick={() => onOpenStory(id, item.title ?? "")}>
            {item.title}
        </button>
    ) : (
        <a href={item.links?.aihot || item.links?.original} target="_blank" rel="noreferrer">
            {item.title}
        </a>
    );
}

function SourceLine({ item }: { item: AihotItem }) {
    return (
        <div className="news-editorial-source">
            <span>{item.source?.name ?? "AIHOT 多源聚合"}</span>
            {item.sourceCount != null ? <span>{item.sourceCount} 个来源</span> : null}
            {item.participantCount != null ? <span>{item.participantCount} 位参与者</span> : null}
            {item.latestAt || item.publishedAt ? <time>{formatAihotTime(item.latestAt || item.publishedAt)}</time> : null}
        </div>
    );
}

function ArticleLinks({ item, onOpenStory }: { item: AihotItem; onOpenStory?: OpenStory }) {
    const id = publicIdFromStoryLink(item.links?.story);
    return (
        <div className="news-editorial-links">
            {item.links?.original ? (
                <a href={item.links.original} target="_blank" rel="noreferrer">
                    查看原文 <ArrowUpRight aria-hidden />
                </a>
            ) : null}
            {id && onOpenStory ? (
                <button type="button" onClick={() => onOpenStory(id, item.title ?? "")}>
                    事件脉络 <ArrowUpRight aria-hidden />
                </button>
            ) : null}
        </div>
    );
}

export function ArticleFeature({ item, rank, onOpenStory, compact = false }: { item: AihotItem; rank?: number; onOpenStory?: OpenStory; compact?: boolean }) {
    const [digest, setDigest] = useState<string>();
    const id = publicIdFromStoryLink(item.links?.story);
    useEffect(() => {
        let alive = true;
        setDigest(undefined);
        if (!item.summary && id) {
            callMcpTool<{ story?: AihotStory }>("aihot_get_story", { public_id: id, report_limit: 3 })
                .then((result) => {
                    if (alive) setDigest(result.story?.digest ?? result.story?.latest);
                })
                .catch(() => {
                    /* 排名仍可阅读，详情请求失败由详情抽屉独立提供重试。 */
                });
        }
        return () => {
            alive = false;
        };
    }, [item.summary, id]);
    return (
        <article className={`news-editorial-feature${compact ? " is-compact" : ""}`}>
            <div className="news-editorial-feature-copy">
                <span className="news-editorial-eyebrow">{rank != null ? `NO. ${String(rank).padStart(2, "0")}` : "头条"}</span>
                <h3>
                    <ArticleTitle item={item} onOpenStory={onOpenStory} />
                </h3>
                {item.summary || digest ? <p className="news-editorial-summary">{item.summary ?? digest}</p> : null}
                <div className="news-editorial-feature-bottom">
                    <SourceLine item={item} />
                    <ArticleLinks item={item} onOpenStory={onOpenStory} />
                    {item.score != null ? (
                        <span className="news-editorial-score">
                            {item.score}
                            <small>热度指数</small>
                        </span>
                    ) : null}
                </div>
            </div>
            {!compact ? <NewsImage item={item} /> : null}
        </article>
    );
}

function ArticleRow({ item, index, onOpenStory, image = false }: { item: AihotItem; index: number; onOpenStory?: OpenStory; image?: boolean }) {
    return (
        <article className={`news-editorial-row${image ? " has-image" : ""}`}>
            <span className="news-editorial-row-number">{String(index).padStart(2, "0")}</span>
            <div className="news-editorial-row-copy">
                <h3>
                    <ArticleTitle item={item} onOpenStory={onOpenStory} />
                </h3>
                {item.summary ? <p className="news-editorial-summary">{item.summary}</p> : null}
                <SourceLine item={item} />
                <ArticleLinks item={item} onOpenStory={onOpenStory} />
            </div>
            {image ? <NewsImage item={item} /> : item.score != null ? <strong className="news-editorial-score">{item.score}</strong> : null}
        </article>
    );
}

export function HotBoard({ items, onOpenStory }: { items: AihotItem[]; onOpenStory: OpenStory }) {
    return (
        <div className="news-editorial news-hot-board">
            <header className="news-editorial-heading">
                <div>
                    <h2>AI 热点榜</h2>
                    <p>多个独立信源同时讨论的 {items.length} 件事</p>
                </div>
                <span>按讨论热度排序 · AIHOT</span>
            </header>
            <div className="news-hot-front">
                <ArticleFeature item={items[0]} rank={1} onOpenStory={onOpenStory} />
                <div className="news-hot-secondary">
                    {items.slice(1, 3).map((item, i) => (
                        <ArticleFeature key={item.id ?? i} item={item} rank={i + 2} compact onOpenStory={onOpenStory} />
                    ))}
                </div>
            </div>
            {items.length > 3 ? (
                <section className="news-hot-rest">
                    <h3 className="news-editorial-eyebrow">继续看 · NO. 04–{String(items.length).padStart(2, "0")}</h3>
                    <div className="news-editorial-ranking">
                        {items.slice(3).map((item, i) => (
                            <ArticleRow key={item.id ?? i} item={item} index={i + 4} onOpenStory={onOpenStory} />
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

export function EditorialEdition({
    title,
    period,
    generatedAt,
    lead,
    sections,
    flashes = [],
    onOpenStory,
    archive,
}: {
    title: string;
    period?: string;
    generatedAt?: string;
    lead?: AihotItem;
    sections: AihotReportSection[];
    flashes?: AihotItem[];
    onOpenStory?: OpenStory;
    archive?: { value: string; type: "date" | "week" | "month"; onChange: (value: string) => void };
}) {
    const items = sections.flatMap((section) => section.items ?? []);
    const sources = new Set(items.map((item) => item.source?.name).filter(Boolean));
    const featured = lead ?? items[0];
    const idPrefix = `edition-${title}`;
    return (
        <div className="news-editorial news-edition">
            <aside className="news-edition-archive" aria-label="期刊导航">
                <span className="news-editorial-eyebrow">{archive ? "往期阅读" : "浏览版面"}</span>
                {archive ? (
                    <>
                        <label htmlFor={`${idPrefix}-date`}>选择{archive.type === "date" ? "日期" : archive.type === "week" ? "周次" : "月份"}</label>
                        <input id={`${idPrefix}-date`} type={archive.type} value={archive.value} onChange={(e) => archive.onChange(e.target.value)} />
                        <button type="button" className="news-edition-current" onClick={() => archive.onChange("")}>
                            回到最新一期
                        </button>
                    </>
                ) : null}
                <nav aria-label="版面目录">
                    {sections.map((section, i) => (
                        <a key={section.label ?? i} href={`#${idPrefix}-${i}`}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <span>{section.label ?? "资讯"}</span>
                            <small>{section.items?.length ?? 0}</small>
                        </a>
                    ))}
                    {flashes.length ? (
                        <a href={`#${idPrefix}-flashes`}>
                            快讯 <small>{flashes.length}</small>
                        </a>
                    ) : null}
                </nav>
            </aside>
            <div className="news-edition-paper">
                <header className="news-edition-masthead">
                    <div>
                        <span className="news-editorial-eyebrow">人工智能 · 多源观察</span>
                        <h2>{title}</h2>
                        <p>AIHOT · 境彻资讯</p>
                    </div>
                    <div className="news-edition-date">
                        <strong>{period || "最新一期"}</strong>
                        {generatedAt ? <time>更新于 {formatAihotTime(generatedAt)}</time> : null}
                    </div>
                </header>
                <div className="news-edition-stats">
                    <span>
                        <strong>{items.length + flashes.length}</strong> 件动态
                    </span>
                    <span>
                        <strong>{sources.size}</strong> 个来源
                    </span>
                    <span className="news-edition-reading">约 {Math.max(1, Math.ceil((items.map((item) => item.summary ?? "").join("").length + (featured?.summary?.length ?? 0)) / 500))} 分钟读完</span>
                </div>
                {featured ? (
                    <div className="news-edition-front">
                        <ArticleFeature item={featured} onOpenStory={onOpenStory} />
                        <aside className="news-edition-highlights">
                            <h3 className="news-editorial-eyebrow">本期看点</h3>
                            {items
                                .filter((item) => item.title !== featured.title)
                                .slice(0, 3)
                                .map((item, i) => (
                                    <div key={item.id ?? i}>
                                        <span>{i + 1}</span>
                                        <div>
                                            <h4>
                                                <ArticleTitle item={item} onOpenStory={onOpenStory} />
                                            </h4>
                                            <small>{item.source?.name ?? "AIHOT"}</small>
                                        </div>
                                    </div>
                                ))}
                        </aside>
                    </div>
                ) : null}
                {sections.map((section, i) => (
                    <section key={section.label ?? i} id={`${idPrefix}-${i}`} className="news-edition-section">
                        <header>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <h3>{section.label ?? "资讯"}</h3>
                            <small>{section.items?.length ?? 0} 件</small>
                        </header>
                        {(section.items ?? []).map((item, index) => (
                            <ArticleRow key={item.id ?? index} item={item} index={index + 1} image onOpenStory={onOpenStory} />
                        ))}
                    </section>
                ))}
                {flashes.length ? (
                    <section id={`${idPrefix}-flashes`} className="news-edition-section">
                        <header>
                            <h3>快讯</h3>
                            <small>{flashes.length} 条</small>
                        </header>
                        {flashes.map((item, i) => (
                            <ArticleRow key={item.id ?? i} item={item} index={i + 1} onOpenStory={onOpenStory} />
                        ))}
                    </section>
                ) : null}
                <footer className="news-edition-end">本期完 · AIHOT 多源聚合，重要事实请查看原文交叉验证</footer>
            </div>
        </div>
    );
}

export function latestSections(items: AihotItem[]): AihotReportSection[] {
    const groups = new Map<string, AihotItem[]>();
    for (const item of items) {
        const label = item.category ? (AIHOT_CATEGORY_LABELS[item.category] ?? "其他动态") : "最新动态";
        groups.set(label, [...(groups.get(label) ?? []), item]);
    }
    return [...groups].map(([label, items]) => ({ label, items }));
}
