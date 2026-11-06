import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import "./commerce-capabilities.css";

const capabilities = [
    { id: "white", title: "白底主图", description: "突出商品主体，清楚呈现轮廓与材质。", image: "white.713727059277.webp", alt: "随行杯白底商品主图示意" },
    { id: "scene", title: "场景种草", description: "把商品放进真实的生活与使用场景。", image: "scene.c4fbbe27095f.webp", alt: "随行杯置于厨房台面的场景图示意" },
    { id: "detail", title: "材质特写", description: "拉近细节，让纹理与工艺成为焦点。", image: "detail.87e65db8e19b.webp", alt: "随行杯金属杯口与涂层材质特写示意" },
    { id: "selling", title: "卖点视觉", description: "围绕关键卖点，组织有层次的商品画面。", image: "selling.f56f3c08af7d.webp", alt: "随行杯置于深色展台的商业视觉示意" },
    { id: "sku", title: "SKU 配色", description: "围绕不同款式与配色，保持展示风格统一。", image: "sku.e171baa205d4.webp", alt: "石墨黑、白色与灰蓝色随行杯配色示意" },
    { id: "set", title: "整套详情", description: "从主图到场景与细节，规划完整商品套图。", image: "set.15def0a9c9d4.webp", alt: "同款随行杯的主图、场景和细节套图示意" },
] as const;

export function CommerceCapabilities() {
    return <section className="commerce-capabilities" aria-labelledby="commerce-capabilities-heading">
        <div className="commerce-capabilities-intro">
            <span className="commerce-capabilities-label">电商 Agent</span>
            <h2 id="commerce-capabilities-heading">一件商品，<br />一整套视觉。</h2>
            <p>上传商品参考图，先定方向，再把主图、场景、卖点与详情做成一套。</p>
            <Link to="/ecommerce" className="commerce-capabilities-cta">开始商品创作<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="commerce-capabilities-content">
            <div className="commerce-capabilities-grid">
                {capabilities.map((item) => <article className="commerce-capability" key={item.id} data-capability={item.id}>
                    <div className="commerce-capability-image"><img src={`${import.meta.env.BASE_URL}assets/commerce-capabilities/${item.image}`} alt={item.alt} width={640} height={360} loading="lazy" decoding="async" /></div>
                    <div className="commerce-capability-copy"><h3>{item.title}</h3><p>{item.description}</p></div>
                </article>)}
            </div>
            <p className="commerce-capabilities-note">配图为 AI 概念示意</p>
        </div>
    </section>;
}
