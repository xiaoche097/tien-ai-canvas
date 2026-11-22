import { useEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowUpRight, Car, ChevronRight, FolderOpen, Gauge, Grid2X2, History, Layers3, Search, Shapes } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Input } from "antd";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { listAutoPartsVehicles, type AutoPartsVehicle } from "@/services/api/auto-parts";
import { bodyLabels, filterAutoPartsVehicles, marketLabels } from "./workflow";
import { AutoPartsWorkbench } from "./workbench";
import "./auto-parts.css";

export default function AutoPartsCenterPage() {
    const [params, setParams] = useSearchParams();
    const [vehicles, setVehicles] = useState<AutoPartsVehicle[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
    const [reload, setReload] = useState(0), [search, setSearch] = useState(""), [body, setBody] = useState("all"), [market, setMarket] = useState("all");
    const [filterDimension, setFilterDimension] = useState<"body" | "market">("body");
    useEffect(() => {
        const controller = new AbortController(); setLoading(true); setError("");
        void listAutoPartsVehicles(controller.signal).then(({ vehicles }) => { if (!controller.signal.aborted) setVehicles(vehicles); }).catch((error) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "车型目录加载失败"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [reload]);
    const selected = vehicles.find((vehicle) => vehicle.id === params.get("vehicle"));
    const items = filterAutoPartsVehicles(vehicles, search, body, market);
    const hasFilters = Boolean(search.trim() || body !== "all" || market !== "all");
    const resetFilters = () => { setSearch(""); setBody("all"); setMarket("all"); };
    return <WorkspacePage className="auto-parts-host" fluid scroll={false}><div className={`auto-parts-page${selected ? " is-workbench" : ""}`}>
        {!selected ? <aside className="auto-parts-sidebar">
            <Link to="/ai-apps/auto-parts-center" className="auto-parts-brand"><span><Car size={25} /></span><div>汽配AI中心<small>AUTO PARTS STUDIO</small></div></Link>
            <nav aria-label="汽配中心导航"><p className="auto-parts-nav-label">创作工作台</p><button type="button" aria-current={!selected ? "page" : undefined} onClick={() => setParams({})}><Grid2X2 size={17} />车型目录<ChevronRight size={14} /></button><Link to="/tasks"><History size={17} />生成记录<ArrowUpRight size={13} /></Link><Link to="/assets"><FolderOpen size={17} />素材库<ArrowUpRight size={13} /></Link></nav>
            <div className="auto-parts-sidebar-reserved"><Layers3 size={18} /><strong>更多汽配功能</strong><p>后续工具将在这里逐步加入。</p></div>
            <Link to="/projects" className="auto-parts-sidebar-back"><ArrowLeft size={16} />返回创意中心</Link>
        </aside> : null}
        <div className="auto-parts-main">
        {loading ? <WorkspaceLoadingState label="正在读取车型目录" /> : error ? <WorkspaceErrorState description={error} onRetry={() => setReload((value) => value + 1)} /> : selected ? <AutoPartsWorkbench key={selected.id} vehicle={selected} onBack={() => setParams({})} /> : <div className="auto-parts-catalog">
            <div className="auto-parts-topbar"><span>汽配AI中心<ChevronRight size={13} />车型目录</span><div className="auto-parts-search"><Input prefix={<Search size={17} />} value={search} onChange={(event) => setSearch(event.target.value)} allowClear aria-label="搜索车型" placeholder="搜索品牌或车型" /></div></div>
            <header className="auto-parts-catalog-header"><div><h1>汽配AI中心</h1><p className="auto-parts-hero-subtitle">选择车型，让你的产品进入真实车内。</p><p>上传同款产品的多角度图片与目标实车内饰，创建自然贴合的商品效果图。</p></div><div className="auto-parts-catalog-count"><strong>{vehicles.length}</strong><span>个车型入口</span></div></header>
            <div className="auto-parts-filter-bar"><div className="auto-parts-filter-dimensions" role="group" aria-label="筛选维度"><button type="button" aria-pressed={filterDimension === "body"} onClick={() => setFilterDimension("body")}><Shapes size={18} /><span>按车身类型</span></button><button type="button" aria-pressed={filterDimension === "market"} onClick={() => setFilterDimension("market")}><Gauge size={18} /><span>按销售市场</span></button></div><div className="auto-parts-body-tabs" role="group" aria-label={filterDimension === "body" ? "按车身类型筛选" : "按销售市场筛选"}>{(filterDimension === "body" ? [{ id: "all", label: "全部车型" }, ...Object.entries(bodyLabels).map(([id, label]) => ({ id, label }))] : [{ id: "all", label: "全部市场" }, ...Object.entries(marketLabels).map(([id, label]) => ({ id, label }))]).map((item) => <button key={item.id} type="button" aria-pressed={(filterDimension === "body" ? body : market) === item.id} onClick={() => filterDimension === "body" ? setBody(item.id) : setMarket(item.id)}>{filterDimension === "body" ? <Car size={14} /> : <Gauge size={14} />}<span>{item.label}</span></button>)}</div></div>
            <div className="auto-parts-catalog-note"><div><span aria-live="polite">车型目录 <strong>{items.length}</strong>{body !== "all" || market !== "all" ? ` · ${bodyLabels[body] || "全部车身"} / ${marketLabels[market] || "全部市场"}` : ""}</span>{hasFilters ? <button type="button" onClick={resetFilters}>清除筛选</button> : null}</div><span>缩略图为类别示意；具体年款、内饰与产品适配需另行核对。</span></div>
            <div className="auto-parts-vehicle-grid">{items.map((vehicle) => <button key={vehicle.id} type="button" className="auto-parts-vehicle-card" onClick={() => setParams({ vehicle: vehicle.id })} aria-label={`进入${vehicle.make} ${vehicle.model}工作台`}>
                <div className="auto-parts-vehicle-image" style={{ backgroundPosition: `${vehicle.previewCell % 3 * 50}% ${vehicle.previewCell < 3 ? 0 : 100}%` } as CSSProperties}><span>{bodyLabels[vehicle.body]}</span><small>车型类别示意</small></div>
                <div className="auto-parts-vehicle-copy"><div className="auto-parts-vehicle-heading"><span className="auto-parts-make-icon"><Car size={20} /></span><div><h2>{vehicle.model}</h2><span className="auto-parts-make">{vehicle.make}</span></div></div><p className="auto-parts-market-tags">{vehicle.markets.map((market) => <span key={market}>{marketLabels[market]}</span>)}</p><p className="auto-parts-card-description">上传同款产品的多角度图片与实车内饰，创建自然贴合的商品展示效果。</p><footer><span>{bodyLabels[vehicle.body]} · 实车效果图</span><ArrowUpRight size={15} /></footer></div>
            </button>)}</div>
            {!items.length ? <div className="auto-parts-no-results"><Car size={28} /><h2>没有找到对应车型</h2><p>调整市场、车身类型或搜索词后再试。</p><button type="button" onClick={resetFilters}>清除筛选</button></div> : null}
        </div>}
        </div>
    </div></WorkspacePage>;
}
