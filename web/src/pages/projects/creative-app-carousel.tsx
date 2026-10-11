import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { CreativeApplication } from "./creative-apps";

function ApplicationVideo({ application, paused }: { application: CreativeApplication; paused: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const video = ref.current;
        if (!video) return;
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
        observer.observe(video);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        const video = ref.current;
        if (!video) return;
        const update = () => {
            if (visible && !paused && !document.hidden)
                void video.play().catch(() => {
                    /* 浏览器禁止自动播放时仍显示封面。 */
                });
            else video.pause();
        };
        update();
        document.addEventListener("visibilitychange", update);
        return () => {
            document.removeEventListener("visibilitychange", update);
            video.pause();
        };
    }, [visible, paused]);
    return failed ? (
        <img src={application.video?.replace(/\.mp4$/, ".jpg")} alt="" />
    ) : (
        <video ref={ref} src={application.video} poster={application.video?.replace(/\.mp4$/, ".jpg")} preload="metadata" muted loop playsInline aria-hidden onError={() => setFailed(true)} />
    );
}

export function CreativeAppCarousel({ applications, onOpen }: { applications: CreativeApplication[]; onOpen: (application: CreativeApplication) => void }) {
    const track = useRef<HTMLDivElement>(null);
    const reducedMotion = useReducedMotion();
    const [paused, setPaused] = useState(false);
    const [held, setHeld] = useState(false);
    const [page, setPage] = useState(0);
    const [pages, setPages] = useState(1);
    const goTo = (index: number) => {
        const el = track.current;
        if (!el) return;
        el.scrollTo({ left: (index * (el.scrollWidth - el.clientWidth)) / Math.max(1, pages - 1), behavior: reducedMotion ? "auto" : "smooth" });
    };
    useEffect(() => {
        const el = track.current;
        if (!el) return;
        const update = () => {
            const count = Math.max(1, Math.ceil((el.scrollWidth - 1) / el.clientWidth));
            setPages(count);
            setPage(Math.min(count - 1, Math.round((el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth)) * (count - 1))));
        };
        const observer = new ResizeObserver(update);
        observer.observe(el);
        el.addEventListener("scroll", update, { passive: true });
        update();
        return () => {
            observer.disconnect();
            el.removeEventListener("scroll", update);
        };
    }, []);
    useEffect(() => {
        if (pages < 2 || paused || held || reducedMotion) return;
        const timer = window.setInterval(() => {
            if (!document.hidden) goTo((page + 1) % pages);
        }, 7000);
        return () => window.clearInterval(timer);
        // goTo 只读取当前 track 与动态减少动画设置。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pages, page, paused, held, reducedMotion]);
    return (
        <section
            className="creative-app-showcase"
            aria-label="最新上线应用"
            aria-roledescription="轮播"
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocusCapture={() => setHeld(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false);
            }}
        >
            <header className="creative-center-section-head">
                <h2>最新上线</h2>
                <button type="button" className="creative-center-icon-button" aria-label={paused || reducedMotion ? "播放应用预览" : "暂停应用预览"} disabled={Boolean(reducedMotion)} onClick={() => setPaused((value) => !value)}>
                    {paused || reducedMotion ? <Play aria-hidden /> : <Pause aria-hidden />}
                </button>
            </header>
            <div className="creative-app-carousel-track" ref={track}>
                {applications.map((application) => (
                    <button key={application.id} type="button" className="creative-app-feature" aria-label={`打开${application.title}`} onClick={() => onOpen(application)}>
                        <ApplicationVideo application={application} paused={paused || Boolean(reducedMotion)} />
                        <span className="creative-app-feature-scrim" aria-hidden />
                        <span className="creative-app-feature-copy">
                            <strong>{application.title}</strong>
                            <span>{application.description}</span>
                        </span>
                    </button>
                ))}
            </div>
            {pages > 1 ? (
                <nav className="creative-app-carousel-controls" aria-label="应用轮播翻页">
                    <button type="button" className="creative-center-icon-button" aria-label="上一组应用" disabled={page === 0} onClick={() => goTo(page - 1)}>
                        <ChevronLeft aria-hidden />
                    </button>
                    <div>
                        {Array.from({ length: pages }, (_, i) => (
                            <button key={i} type="button" aria-label={`第 ${i + 1} 组应用`} aria-pressed={page === i} onClick={() => goTo(i)} />
                        ))}
                    </div>
                    <button type="button" className="creative-center-icon-button" aria-label="下一组应用" disabled={page === pages - 1} onClick={() => goTo(page + 1)}>
                        <ChevronRight aria-hidden />
                    </button>
                </nav>
            ) : null}
        </section>
    );
}
