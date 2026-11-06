import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { useInView } from "motion/react";
import { Link } from "react-router";
import { creationShowcaseColumns, creationShowcaseHero, type CreationShowcaseMedia } from "./creation-showcase-media";
import "./creation-showcase.css";

function ShowcaseMedia({ media, active, hero = false }: { media: CreationShowcaseMedia; active: boolean; hero?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const visible = useInView(ref, { amount: 0.05 });
    const [failed, setFailed] = useState(false);
    const poster = `${import.meta.env.BASE_URL}${media.poster}`;
    useEffect(() => {
        const player = video.current;
        if (!player) return;
        let cancelled = false;
        if (active && visible) void player.play().catch(() => { if (!cancelled) setFailed(true); });
        else player.pause();
        return () => { cancelled = true; player.pause(); };
    }, [active, visible, media.videoSrc, failed]);
    return <div ref={ref} className="creation-showcase-media">
        {media.videoSrc && !failed ? <video ref={video} src={media.videoSrc} poster={poster} muted loop playsInline preload="none" onError={() => setFailed(true)} aria-label={hero ? media.title : undefined} />
            : <img src={poster} alt={hero ? "霓虹街景创作封面" : ""} loading="lazy" decoding="async" />}
    </div>;
}

export function CreationShowcase() {
    const ref = useRef<HTMLElement>(null);
    const visible = useInView(ref, { amount: 0.08 });
    const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const [paused, setPaused] = useState(false);
    const [pageVisible, setPageVisible] = useState(!document.hidden);
    useEffect(() => {
        const update = () => setPageVisible(!document.hidden);
        const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
        const updateMotion = () => setReducedMotion(preference.matches);
        document.addEventListener("visibilitychange", update);
        preference.addEventListener("change", updateMotion);
        updateMotion();
        return () => {
            document.removeEventListener("visibilitychange", update);
            preference.removeEventListener("change", updateMotion);
        };
    }, []);
    const active = visible && pageVisible && !paused && !reducedMotion;
    const categories = creationShowcaseColumns.flat().map((media) => media.title);
    return <section ref={ref} className="creation-showcase" data-motion={active ? "playing" : "paused"} aria-labelledby="creation-showcase-heading">
        <div className="creation-showcase-stage">
            <div className="creation-showcase-copy">
                <span className="creation-showcase-eyebrow">境彻 · 创作现场</span>
                <h2 id="creation-showcase-heading">让灵感<br />成为下一幕。</h2>
                <p>从一帧画面，到一整个故事。<br />把你想象的，变成看得见的。</p>
                <Link to="/projects" className="creation-showcase-cta">探索创作<ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <div className="creation-showcase-hero"><ShowcaseMedia media={creationShowcaseHero} active={active} hero /></div>
            <div className="creation-showcase-wall" aria-label="创作方向封面">
                {creationShowcaseColumns.map((column, index) => <div key={index} className="creation-showcase-lane">
                    <div className="creation-showcase-track">
                        {[0, 1].map((copy) => <div key={copy} className="creation-showcase-group" aria-hidden={copy === 1 || undefined}>
                            {column.map((media) => <figure key={media.id} className="creation-showcase-card">
                                <ShowcaseMedia media={media} active={active} />
                                <figcaption>{media.title}</figcaption>
                            </figure>)}
                        </div>)}
                    </div>
                </div>)}
            </div>
        </div>
        <div className="creation-showcase-ribbon" aria-hidden="true"><div className="creation-showcase-ribbon-track">
            {[0, 1].map((copy) => <div key={copy} className="creation-showcase-ribbon-group">{categories.map((title) => <span key={title}>{title}<span className="creation-showcase-divider">✦</span></span>)}</div>)}
        </div></div>
        <button type="button" className="creation-showcase-motion" onClick={() => setPaused((value) => !value)} disabled={Boolean(reducedMotion)} aria-label={reducedMotion ? "已遵循系统减少动态效果设置" : paused ? "播放展示动画" : "暂停展示动画"} aria-pressed={paused || Boolean(reducedMotion)} title={reducedMotion ? "已遵循系统减少动态效果设置" : paused ? "播放动画" : "暂停动画"}>
            {paused || reducedMotion ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
        </button>
    </section>;
}
