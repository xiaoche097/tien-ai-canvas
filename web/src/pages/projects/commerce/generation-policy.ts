import { fitsRatio, parseOutputSize, preferredPlatformSize, type PlatformRule } from "./platform-standards";

export function generatedImageMime(header: Uint8Array) {
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value)) return "image/png";
    if (header[0] === 255 && header[1] === 216 && header[2] === 255) return "image/jpeg";
    if (String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP") return "image/webp";
    return "";
}

export function generationPolicy(rule: PlatformRule | undefined, currentSize: string, sizes: string[], merchantRules: string) {
    const size = preferredPlatformSize(rule, sizes) || currentSize;
    const blockers: string[] = [];
    if (!rule) blockers.push("请先选择一个目标平台，智能匹配需要需求中有明确的平台名称。");
    if (rule?.disallowGeneratedProduct) blockers.push("该平台用途禁止商品数字渲染图，请使用真实拍摄图片，不能执行 AI 商品主图生成。");
    if (rule?.status === "pending" && !merchantRules.trim()) blockers.push("此平台规范待核验，请从商家后台确认并填写补充规范后再生成。");
    if (rule?.ratio && !fitsRatio(size, rule.ratio)) blockers.push(`当前模型不支持所需 ${rule.ratio.join(":")} 版式，请更换图片模型。`);
    const pixels = parseOutputSize(size);
    if (rule?.minimum && pixels && (pixels[0] < rule.minimum[0] || pixels[1] < rule.minimum[1])) blockers.push("当前模型尺寸低于平台最低像素要求，请更换模型或尺寸。");
    if (rule?.longestMinimum && pixels && Math.max(...pixels) < rule.longestMinimum) blockers.push("当前图片最长边低于平台要求，请更换模型或尺寸。");
    return { size, blockers };
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
