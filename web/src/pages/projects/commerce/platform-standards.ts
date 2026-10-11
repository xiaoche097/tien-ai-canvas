export type PlatformRule = {
    id: string;
    label: string;
    scope: string;
    status: "verified" | "guidance" | "partial" | "pending";
    source: string;
    contentSource?: string;
    rules: string[];
    minimum?: [number, number];
    longestMinimum?: number;
    ratio?: [number, number];
    recommendedSize?: [number, number];
    noOverlay?: boolean;
    noPromotion?: boolean;
    disallowGeneratedProduct?: boolean;
};
export type CommercePlatform = { id: string; name: string; aliases: string[]; rules: PlatformRule[] };
const amazonModules = "https://developer-docs.amazon.com/sp-api/docs/a-plus-content-examples";
const amazonContent = "https://sell.amazon.com/blog/a-plus-content-design-guide";
const tiktokPolicy = "https://seller-us.tiktok.com/university/course?content_id=7073362639816491&learning_id=7350062255294222";
const pending = (source: string, scope: string, extra?: string): PlatformRule[] => [
    {
        id: "main",
        label: "商品主图",
        scope,
        status: "pending",
        source,
        rules: [extra || "该平台的图片规范需按站点、类目及商家后台当前版本核验；尚未取得可公开核验的完整规则。", "尺寸、格式、文件大小、背景、文字与营销元素要求尚待核验，不自动套用其他平台的规则。"],
    },
];

// Numeric limits belong to the named placement and market, never to the platform as a whole.
export const commercePlatforms: CommercePlatform[] = [
    { id: "auto", name: "智能匹配", aliases: [], rules: [] },
    { id: "taobao", name: "淘宝", aliases: ["淘宝", "taobao"], rules: pending("https://rulechannel.taobao.com/", "中国大陆 · 商品主图") },
    { id: "1688", name: "1688", aliases: ["1688"], rules: pending("https://rule.1688.com/", "中国大陆 · 类目商品主图") },
    { id: "tmall", name: "天猫", aliases: ["天猫", "tmall"], rules: pending("https://www.tmall.com/wow/seller/act/pinkongrule", "中国大陆 · 类目商品主图") },
    { id: "pdd", name: "拼多多", aliases: ["拼多多", "pinduoduo"], rules: pending("https://mms.pinduoduo.com/", "中国大陆 · 商品轮播首图") },
    {
        id: "jd",
        name: "京东",
        aliases: ["京东", "jingdong"],
        rules: [
            {
                id: "main",
                label: "商品图像设计",
                scope: "京东零售设计语言 · 设计指导，非类目上传门槛",
                status: "guidance",
                source: "https://jdrdl.jd.com/Design-image.html",
                rules: ["图像清晰、真实且自然，优先正视图，侧视图用于展示更多细节。", "建议主体占画面约 60%，利用留白突出商品；优先低饱和单色背景，避免复杂背景。", "本指导不提供通用上传尺寸和文件上限；正式上架需核对京东商家后台类目规则。"],
            },
        ],
    },
    {
        id: "douyin",
        name: "抖音",
        aliases: ["抖音", "douyin"],
        rules: [
            {
                id: "main",
                label: "抖店商品主图优化",
                scope: "中国大陆 · 抖音电商学习中心优化教程，非最新准入政策",
                status: "guidance",
                source: "https://school.jinritemai.com/doudian/web/articlev0/aHb9JW7DYjvW",
                recommendedSize: [600, 600],
                rules: [
                    "官方教程建议 600 × 600 px 以上清晰、不变形的实拍商品图；不将此建议作为全部类目的硬性上传门槛。",
                    "主体宜占画面一半以上，背景简洁且与商品区分，避免水印与拼接。",
                    "教程针对主图设计优化；当前站点类目的文件格式、大小、营销文案限制仍需商家后台核验。",
                ],
            },
        ],
    },
    {
        id: "amazon",
        name: "亚马逊A+",
        aliases: ["亚马逊", "amazon"],
        rules: [
            {
                id: "header",
                label: "A+ 标准图文页头",
                scope: "Amazon · Basic A+ · STANDARD_HEADER_IMAGE_TEXT",
                status: "verified",
                source: amazonModules,
                contentSource: amazonContent,
                minimum: [970, 600],
                ratio: [970, 600],
                noPromotion: true,
                rules: ["模块图片最低 970 × 600 px；不套用商品首图的纯白背景规则。", "不加入价格、优惠、配送信息、二维码、外链或联系方式；文案不含保修与保证信息。", "图片与文案需准确对应商品；A+ 发布资格、站点与类目需在 Seller Central 确认。"],
            },
            {
                id: "overlay",
                label: "A+ 标准图片文字叠加",
                scope: "Amazon · Basic A+ · STANDARD_IMAGE_TEXT_OVERLAY",
                status: "verified",
                source: amazonModules,
                contentSource: amazonContent,
                minimum: [970, 300],
                ratio: [970, 300],
                noPromotion: true,
                rules: ["模块图片最低 970 × 300 px；图片替代文本为必填项，最多 100 字符。", "不加入价格、促销、配送、二维码、外链、联系方式或保修承诺。"],
            },
        ],
    },
    { id: "temu", name: "TEMU", aliases: ["temu"], rules: pending("https://seller.kuajingmaihuo.com/", "按店铺站点与经营模式核验") },
    {
        id: "emag",
        name: "eMAG",
        aliases: ["emag"],
        rules: [
            {
                id: "main",
                label: "商品主图",
                scope: "eMAG Marketplace · 已核验公开摘要，完整规范需登录",
                status: "partial",
                source: "https://marketplace.emag.ro/infocenter/emag-academy/how-to-add-a-product/the-main-product-image-standard/?lang=en",
                rules: [
                    "完整、清晰地展示居中商品，尽量占据画面（约 85%），只展示买家将收到的颜色、尺寸及形态版本。",
                    "推荐白色或灰色背景；允许专业场景图的类目可以使用场景背景。",
                    "完整格式、文件大小与像素限制需要商家账号登录核验，不能据此宣称已通过完整审核。",
                ],
            },
        ],
    },
    {
        id: "ebay",
        name: "eBay",
        aliases: ["ebay"],
        rules: [
            {
                id: "main",
                label: "商品刊登图片",
                scope: "eBay · 公共图片政策",
                status: "verified",
                source: "https://www.ebay.com/help/policies/selling-policies/listing-policy?id=4370",
                longestMinimum: 500,
                noOverlay: true,
                rules: ["刊登至少一张图片；每张图片最长边至少 500 px，不强制正方形。", "不得添加边框、文字、图案、营销素材或任何水印。", "图片必须准确呈现商品；二手、破损或瑕疵商品不能用图库图替代实物图。"],
            },
        ],
    },
    {
        id: "shein",
        name: "SHEIN",
        aliases: ["shein"],
        rules: pending("https://open.sheincorp.cn/zh/documents/apidoc/detail/3001126", "SHEIN · 按商品图片方案与类目核验", "官方发布接口明确图片类型、数量、尺寸随商品图片方案确定，不能以单一固定尺寸覆盖全部类目。"),
    },
    {
        id: "shopee",
        name: "Shopee",
        aliases: ["shopee", "虾皮"],
        rules: [
            {
                id: "main",
                label: "商品封面图",
                scope: "新加坡 · Shopee Ads 商品页优化建议",
                status: "guidance",
                source: "https://ads.shopee.sg/learn/faq/520/172",
                recommendedSize: [1024, 1024],
                ratio: [1, 1],
                rules: ["官方建议 1:1 方图、至少 1024 × 1024 px；这是优化建议，不是所有站点的上传门槛。", "建议封面使用白色简洁背景、商品占画面一半以上，避免水印及无关图案。", "如实展示实物及规格，不夸大特征，不展示不包含在购买中的配件。"],
            },
        ],
    },
    {
        id: "lazada",
        name: "Lazada",
        aliases: ["lazada"],
        rules: [
            ...pending("https://university.lazada.com/", "按东南亚店铺站点及类目核验"),
            {
                id: "promotion-long",
                label: "买家促销长图",
                scope: "Lazada Open Platform · promotion_long_image，不适用于普通主图",
                status: "partial",
                source: "https://open.lazada.com/apps/announcement/detail?docId=1798",
                minimum: [750, 1000],
                ratio: [3, 4],
                rules: ["官方 Product API 公告规定促销长图最低 750 × 1000 px；此字段与商品主图、SKU 图不同。", "该公告为特定字段的技术说明；当前店铺可用性、完整内容及文件限制仍需商家后台核验。"],
            },
        ],
    },
    {
        id: "tiktok",
        name: "TikTok",
        aliases: ["tiktok"],
        rules: [
            {
                id: "main",
                label: "TikTok Shop 商品首图",
                scope: "美国站 · 商品刊登政策",
                status: "verified",
                source: tiktokPolicy,
                minimum: [600, 600],
                ratio: [1, 1],
                noOverlay: true,
                noPromotion: true,
                disallowGeneratedProduct: true,
                rules: [
                    "图片至少 600 × 600 px，最多 9 张方图；建议至少 5 张不同角度的实物图片。",
                    "首图清晰展示商品正面，不添加文字、图案、水印或营销贴纸。",
                    "不使用占位图、商品数字渲染图、黑白图、马赛克或掩盖品牌的滤镜。",
                    "商品信息真实准确，不夸大效果，不添加站外链接或二维码导流。AI 生成商品渲染图不适合直接用于该用途。",
                ],
            },
        ],
    },
    {
        id: "ozon",
        name: "Ozon",
        aliases: ["ozon"],
        rules: pending("https://docs.ozon.ru/global/products/requirements/media/image-requirements/?country=CN", "Ozon · 按类目与展示用途核验", "官方文档目前无法读取完整条款；图片规格需在 Ozon Seller 按类目确认。"),
    },
];
export const standardsCheckedAt = "2026-10-11";
export function resolvePlatform(name: string, requirements: string) {
    const explicit = commercePlatforms.find((platform) => platform.name === name);
    if (explicit && explicit.id !== "auto") return { platform: explicit, reason: "手动选择" };
    const text = requirements.toLowerCase();
    const matches = commercePlatforms.filter((platform) => platform.aliases.some((alias) => (/^[a-z0-9]+$/i.test(alias) ? new RegExp(`(^|[^a-z0-9])${alias}([^a-z0-9]|$)`, "i").test(text) : text.includes(alias))));
    return matches.length === 1
        ? { platform: matches[0], reason: "按需求中的平台名称匹配，可手动更改" }
        : { platform: commercePlatforms[0], reason: matches.length > 1 ? "需求涉及多个平台，请明确选择一个目标平台" : "填写具体平台名称后匹配；不会根据商品外观猜测平台" };
}
export function platformRule(platform: CommercePlatform, ruleId?: string) {
    return platform.rules.find((rule) => rule.id === ruleId) || platform.rules[0];
}
export function parseOutputSize(value: string): [number, number] | undefined {
    const match = value.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? [Number(match[1]), Number(match[2])] : undefined;
}
function parseRatio(value: string): [number, number] | undefined {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? [Number(match[1]), Number(match[2])] : parseOutputSize(value);
}
export function fitsRatio(size: string, ratio: [number, number]) {
    const actual = parseRatio(size);
    return !!actual && Math.abs(actual[0] / actual[1] - ratio[0] / ratio[1]) < 0.01;
}
export function preferredPlatformSize(rule: PlatformRule | undefined, sizes: string[]) {
    if (!rule?.ratio || rule.status === "pending") return undefined;
    return sizes.find((size) => {
        const pixels = parseOutputSize(size);
        const target = rule.minimum || rule.recommendedSize;
        return fitsRatio(size, rule.ratio!) && (!pixels || !target || (pixels[0] >= target[0] && pixels[1] >= target[1]));
    });
}
export function checkPlatformSettings(rule: PlatformRule | undefined, size: string, requirements: string): string[] {
    if (!rule) return ["将使用通用商品展示原则，不套用未确认的平台条款。"];
    if (rule.status === "pending") return ["平台完整规范尚待核验，已知要求与通用规避原则会用于本次创作。"];
    const issues: string[] = [];
    if (rule.status === "partial") issues.push("已应用公开条款；完整上传与内容规范仍需登录商家后台核验。");
    const pixels = parseOutputSize(size);
    if (rule.disallowGeneratedProduct) issues.push("该用途禁止商品数字渲染图：请使用真实拍摄图片，AI 生成图不能作为已合规的上架首图。");
    if (rule.ratio && !fitsRatio(size, rule.ratio)) issues.push(`${rule.status === "guidance" ? "建议" : "目标版式"}比例 ${rule.ratio[0]}:${rule.ratio[1]}；当前模型尺寸尚未匹配。`);
    if (rule.minimum && pixels && (pixels[0] < rule.minimum[0] || pixels[1] < rule.minimum[1])) issues.push(`当前尺寸低于最低 ${rule.minimum[0]} × ${rule.minimum[1]} px。`);
    if (rule.longestMinimum && pixels && Math.max(...pixels) < rule.longestMinimum) issues.push(`当前最长边低于最低 ${rule.longestMinimum} px。`);
    if ((rule.minimum || rule.longestMinimum || rule.recommendedSize) && !pixels) issues.push("当前模型仅提供比例或自动尺寸，无法据此确认最终像素；须在导出后检查实际图片。");
    if (rule.recommendedSize && pixels && (pixels[0] < rule.recommendedSize[0] || pixels[1] < rule.recommendedSize[1])) issues.push(`当前尺寸未达到官方建议 ${rule.recommendedSize[0]} × ${rule.recommendedSize[1]} px。`);
    if (rule.noOverlay && /文字|水印|边框|贴纸|logo|text|watermark|border/i.test(requirements)) issues.push("需求提及文字、水印或边框等元素，请核对是否与图片政策冲突；这是关键词提示，不是图像审核。");
    if (rule.noPromotion && /促销|折扣|优惠|二维码|外链|联系方式|保修|discount|qr\s*code/i.test(requirements)) issues.push("需求提及促销或导流等内容；生成时将优先规避平台限制元素，保留商品展示意图。");
    return issues;
}
export function compileCommerceBrief(input: {
    platform: CommercePlatform;
    rule?: PlatformRule;
    requirements: string;
    language: string;
    size: string;
    count: string;
    product: string;
    sellingPoints: string;
    audience: string;
    style: string;
    avoid: string;
    merchantRules: string;
}) {
    const { platform, rule } = input;
    return [
        `目标平台：${platform.name}`,
        rule ? `用途：${rule.label}\n适用范围：${rule.scope}` : "用途与平台待确认",
        `语言：${input.language}\n模型画面参数：${input.size || "未选择"}\n生成数量：${input.count}`,
        ...[
            ["商品", input.product],
            ["卖点", input.sellingPoints],
            ["人群", input.audience],
            ["风格与保留内容", input.style],
            ["避免内容", input.avoid],
            ["创作需求", input.requirements],
        ]
            .filter(([, value]) => value.trim())
            .map(([label, value]) => `${label}：${value}`),
        rule
            ? `平台规范（${rule.status === "pending" ? "待核验" : rule.status === "guidance" ? "官方优化建议" : rule.status === "partial" ? "部分条款已核验" : "已核验条款"}）：\n${rule.rules.map((text) => `- ${text}`).join("\n")}\n来源：${rule.source}${rule.contentSource ? `\n内容要求来源：${rule.contentSource}` : ""}\n资料核验日期：${standardsCheckedAt}`
            : "尚未应用特定平台规范。",
        input.merchantRules.trim() ? `商家补充规范（用户提供，尚未独立核验）：\n${input.merchantRules}` : "",
        "产品参考素材用于保留商品外观，不代表已符合最终上架图片标准。生成后仍需核对实物一致性、实际尺寸、格式、文件大小、文案与对应站点类目规则。",
    ]
        .filter(Boolean)
        .join("\n\n");
}
