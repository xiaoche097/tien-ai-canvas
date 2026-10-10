import { ArrowRight, ChevronLeft, ChevronRight, Clapperboard, Puzzle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "antd";

import { listSkills, type Skill } from "@/services/api/skills";
import { useUserStore } from "@/stores/use-user-store";
import { skillCategoryLabel } from "./skill-catalog";

/** Discovery uses the public catalog; every entry opens the existing skill detail flow. */
export function SkillMarketDiscovery({ onOpen, onBrowse }: { onOpen: (skill: Skill) => void; onBrowse: () => void }) {
    const userId = useUserStore((state) => state.user?.id);
    const [catalog, setCatalog] = useState<Skill[]>([]);
    const [popular, setPopular] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const [slide, setSlide] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setCatalog([]);
        setPopular([]);
        setError("");
        setSlide(0);
        Promise.all([listSkills({ scope: "public", sort: "new", pageSize: 80 }), listSkills({ scope: "public", sort: "popular", pageSize: 6 })])
            .then(([latest, hot]) => {
                if (cancelled) return;
                setCatalog(latest.skills);
                setPopular(hot.skills);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "推荐内容加载失败");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId, reload]);

    if (error)
        return (
            <div className="market-discovery-error" role="alert">
                {error}
                <Button onClick={() => setReload((value) => value + 1)}>重试</Button>
            </div>
        );
    if (loading)
        return (
            <div className="market-discovery-loading" aria-label="正在加载市场推荐" aria-busy="true">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} />
                ))}
            </div>
        );
    if (!catalog.length) return null;

    const withMedia = catalog.filter((skill) => skill.showcaseMedia?.some((media) => media.showcaseUrl));
    const featured = (withMedia.length ? withMedia : catalog).slice(0, 12);
    const pages = Math.ceil(featured.length / 4);
    const currentSlide = Math.min(slide, pages - 1);
    const builtin = catalog.filter((skill) => skill.sourceType === "builtin").slice(0, 6);

    return (
        <div className="market-discovery">
            <section aria-labelledby="market-latest-title">
                <header className="market-section-header">
                    <h2 id="market-latest-title">最新上线</h2>
                    {pages > 1 && (
                        <div className="market-carousel-controls">
                            <button type="button" aria-label="上一组推荐" disabled={currentSlide === 0} onClick={() => setSlide(currentSlide - 1)}>
                                <ChevronLeft />
                            </button>
                            <button type="button" aria-label="下一组推荐" disabled={currentSlide === pages - 1} onClick={() => setSlide(currentSlide + 1)}>
                                <ChevronRight />
                            </button>
                        </div>
                    )}
                </header>
                <div className="market-featured-grid">
                    {featured.slice(currentSlide * 4, currentSlide * 4 + 4).map((skill) => (
                        <FeaturedSkill key={skill.skillId} skill={skill} onOpen={onOpen} />
                    ))}
                </div>
                {pages > 1 && (
                    <div className="market-carousel-pages" aria-label="推荐分页">
                        {Array.from({ length: pages }, (_, i) => (
                            <button key={i} type="button" aria-label={`第 ${i + 1} 组推荐`} aria-pressed={currentSlide === i} onClick={() => setSlide(i)} />
                        ))}
                    </div>
                )}
            </section>
            {builtin.length > 0 && (
                <section aria-labelledby="market-builtin-title">
                    <header className="market-section-header">
                        <h2 id="market-builtin-title">内置精选</h2>
                        <button type="button" className="market-section-link" onClick={onBrowse}>
                            查看全部
                            <ArrowRight />
                        </button>
                    </header>
                    <div className="market-official-grid">
                        {builtin.map((skill) => (
                            <button key={skill.skillId} type="button" className="market-official-item" onClick={() => onOpen(skill)}>
                                <span className="market-item-icon">
                                    <Puzzle />
                                </span>
                                <span>{skill.skillName}</span>
                                <ArrowRight className="market-item-arrow" />
                            </button>
                        ))}
                    </div>
                </section>
            )}
            {popular.length > 0 && (
                <section aria-labelledby="market-popular-title">
                    <header className="market-section-header">
                        <h2 id="market-popular-title">热门用例</h2>
                    </header>
                    <div className="market-usecase-grid">
                        {popular.map((skill) => (
                            <button key={skill.skillId} type="button" className="market-usecase-item" onClick={() => onOpen(skill)}>
                                <span className="market-item-icon">
                                    <Clapperboard />
                                </span>
                                <span className="market-usecase-copy">
                                    <strong>{skill.skillName}</strong>
                                    <span>{skill.effectiveUser?.name || skillCategoryLabel(skill.tag, [])}</span>
                                </span>
                                <ArrowRight className="market-item-arrow" />
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function FeaturedSkill({ skill, onOpen }: { skill: Skill; onOpen: (skill: Skill) => void }) {
    const media = skill.showcaseMedia?.find((item) => item.type === "image" && item.showcaseUrl) || skill.showcaseMedia?.find((item) => item.showcaseUrl);
    const [failed, setFailed] = useState(false);
    return (
        <button type="button" className={`market-featured-card${!media || failed ? " has-no-media" : ""}`} onClick={() => onOpen(skill)} aria-label={`查看${skill.skillName}`}>
            {media && !failed ? (
                media.type === "image" ? (
                    <img src={media.showcaseUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
                ) : (
                    <video src={media.showcaseUrl} muted playsInline preload="metadata" onError={() => setFailed(true)} />
                )
            ) : (
                <div className="market-featured-fallback">
                    <Clapperboard />
                    <strong>{skill.skillName}</strong>
                </div>
            )}
            <div className="market-featured-copy">
                <h3>{skill.skillName}</h3>
                <p>{skill.description || "查看技能详情与使用方法"}</p>
            </div>
        </button>
    );
}
