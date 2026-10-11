import { useEffect, useRef, useState } from "react";
import { useCreativeReducedMotion } from "./creative-motion";

export function CreativeStudioSurface({ paused }: { paused: boolean }) {
    const surface = useRef<HTMLDivElement>(null);
    const reducedMotion = useCreativeReducedMotion();
    const [active, setActive] = useState(false);
    useEffect(() => {
        const node = surface.current;
        if (!node) return;
        const desktop = matchMedia("(min-width: 768px)");
        let visible = false;
        const update = () => setActive(visible && desktop.matches && !document.hidden);
        const observer = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            update();
        });
        observer.observe(node);
        desktop.addEventListener("change", update);
        document.addEventListener("visibilitychange", update);
        return () => {
            observer.disconnect();
            desktop.removeEventListener("change", update);
            document.removeEventListener("visibilitychange", update);
        };
    }, []);
    return <div ref={surface} className="creative-studio-surface" aria-hidden="true" data-surface-mode={active && !paused && reducedMotion === false ? "animated" : "static"} />;
}
