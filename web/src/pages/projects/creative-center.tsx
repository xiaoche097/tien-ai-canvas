import { useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { creativeApplications, type CreativeApplication } from "./creative-apps";
import { CreativeAppCarousel } from "./creative-app-carousel";
import { CreativeAppLauncher } from "./creative-app-launcher";
import "./creative-center.css";

const categories = ["全部", "影视创意", "电商广告", "社媒内容", "创意设计"];

export function CreativeCenter({ onShortDrama }: { onShortDrama: () => void }) {
    const [category, setCategory] = useState("全部");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<CreativeApplication | null>(null);
    const open = (application: CreativeApplication) => {
        if (application.id === "short-drama") onShortDrama();
        else setSelected(application);
    };
    const items = creativeApplications.filter((application) => (category === "全部" || application.category === category) && `${application.title} ${application.description}`.toLowerCase().includes(search.trim().toLowerCase()));
    return (
        <div className="creative-center">
            <header className="creative-center-header">
                <h1>创意中心</h1>
                <p>选择创作方向，把灵感一步步变成作品</p>
            </header>
            <CreativeAppCarousel applications={creativeApplications.filter((application) => application.video)} onOpen={open} />
            <section className="creative-app-catalog" aria-label="全部创意应用">
                <header className="creative-center-section-head">
                    <h2>全部应用</h2>
                </header>
                <div className="creative-app-filters">
                    <div className="creative-app-categories" role="group" aria-label="创意应用分类">
                        {categories.map((item) => (
                            <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>
                                {item}
                            </button>
                        ))}
                    </div>
                    <label className="creative-app-search">
                        <Search aria-hidden />
                        <input type="search" aria-label="搜索创意应用" placeholder="搜索应用或创作方向" value={search} onChange={(event) => setSearch(event.target.value)} />
                        {search ? (
                            <button type="button" aria-label="清除应用搜索" onClick={() => setSearch("")}>
                                <X aria-hidden />
                            </button>
                        ) : null}
                    </label>
                </div>
                <div className="creative-app-grid">
                    {items.map((application) => {
                        const Icon = application.icon;
                        return (
                            <button key={application.id} type="button" className="creative-app-card" onClick={() => open(application)}>
                                <span className="creative-app-card-heading">
                                    <span className="creative-app-icon">
                                        <Icon aria-hidden />
                                    </span>
                                    <strong>{application.title}</strong>
                                    <ArrowUpRight className="creative-app-arrow" aria-hidden />
                                </span>
                                <span className="creative-app-card-description">{application.description}</span>
                                <span className="creative-app-card-category">{application.category}</span>
                            </button>
                        );
                    })}
                </div>
                {!items.length ? (
                    <div className="creative-app-empty">
                        <p>没有找到匹配的应用</p>
                        <button
                            type="button"
                            onClick={() => {
                                setCategory("全部");
                                setSearch("");
                            }}
                        >
                            重置筛选
                        </button>
                    </div>
                ) : null}
            </section>
            {selected ? <CreativeAppLauncher key={selected.id} application={selected} onClose={() => setSelected(null)} /> : null}
        </div>
    );
}
