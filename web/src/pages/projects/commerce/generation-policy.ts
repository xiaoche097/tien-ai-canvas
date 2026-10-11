import { fitsRatio, parseOutputSize, preferredPlatformSize, type PlatformRule } from "./platform-standards";

export function generatedImageMime(header: Uint8Array) {
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value)) return "image/png";
    if (header[0] === 255 && header[1] === 216 && header[2] === 255) return "image/jpeg";
    if (String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP") return "image/webp";
    return "";
}

export function generationPolicy(rule: PlatformRule | undefined, currentSize: string, sizes: string[], merchantRules: string) {
    const size = preferredPlatformSize(rule, sizes) || currentSize;
    const warnings: string[] = [];
    if (!rule) warnings.push("尚未匹配具体平台，将按通用商品创作要求生成；可继续生成或返回选择平台。");
    if (rule?.disallowGeneratedProduct) warnings.push("此平台用途不接受商品数字渲染图；可以继续制作创意草稿，直接上架时请使用符合要求的实拍素材。");
    if (rule?.status === "pending" && !merchantRules.trim()) warnings.push("此平台完整规范尚待核验，将按通用商品展示原则生成；商家补充规范可选，不影响创作。");
    if (rule?.ratio && !fitsRatio(size, rule.ratio)) warnings.push(`当前模型没有 ${rule.ratio.join(":")} 版式，将使用 ${size} 生成；上架前可裁切调整。`);
    const pixels = parseOutputSize(size);
    if (rule?.minimum && pixels && (pixels[0] < rule.minimum[0] || pixels[1] < rule.minimum[1])) warnings.push("当前模型尺寸低于平台建议的上架最低像素要求；可继续创作，上架前请调整尺寸。");
    if (rule?.longestMinimum && pixels && Math.max(...pixels) < rule.longestMinimum) warnings.push("当前图片最长边低于平台要求；可继续创作，上架前请调整尺寸。");
    return { size, warnings };
}

export function checkGeneratedImage(rule: PlatformRule, image: { width: number; height: number; bytes: number; mimeType: string }) {
    const failures: string[] = [];
    if (!image.width || !image.height) failures.push("未能读取真实像素，不能确认尺寸合规。");
    if (rule.minimum && (image.width < rule.minimum[0] || image.height < rule.minimum[1])) failures.push(`未达到最低 ${rule.minimum.join(" × ")} px。`);
    if (rule.longestMinimum && Math.max(image.width, image.height) < rule.longestMinimum) failures.push(`最长边低于 ${rule.longestMinimum} px。`);
    if (rule.ratio && !fitsRatio(`${image.width}x${image.height}`, rule.ratio)) failures.push(`实际比例不符合 ${rule.ratio.join(":")}。`);
    if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimeType)) failures.push("当前格式需转换为平台接受的格式。");
    if (!image.bytes) failures.push("无法确认文件大小。");
    return { failures, review: "请人工核对商品一致性、背景、文字、营销元素及当前站点类目要求；像素检查通过不代表平台审核通过。" };
}
