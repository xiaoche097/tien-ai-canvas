import { Newspaper } from "lucide-react";

import { useAppearanceStore } from "@/stores/use-appearance-store";

/** 资讯占位页：入口已就绪，内容由产品后续补充。 */
export default function NewsPage() {
    const brandName = useAppearanceStore((state) => state.appearance.brandName);

    return (
        <div className="news-page">
            <span className="news-page-icon" aria-hidden>
                <Newspaper className="size-6" strokeWidth={1.6} />
            </span>
            <h1 className="news-page-title">资讯</h1>
            <p className="news-page-subtitle">{brandName} 资讯频道正在筹备中，敬请期待。</p>
        </div>
    );
}
