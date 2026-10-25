export type ReferenceModule = { type: string; title: string; goal: string; copy?: string; visualPrompt?: string };

export function moduleReferenceGuide(section: ReferenceModule) {
  const text = `${section.title} ${section.goal} ${section.copy || ""}`;
  const shots = ["同一款、同一颜色的清晰完整商品图，主体不裁切，用于锁定轮廓、比例和结构"];
  if (/佩戴|穿搭|模特|场景|使用|worn|wear|lifestyle|SCENARIO/i.test(`${section.type} ${text}`)) {
    shots.push("实际佩戴或使用图，拍清商品与身体/使用环境的接触位置；没有实拍时沿用已提供的产品视角");
  }
  if (/材质|织|纹理|面料|material|texture|MATERIAL/i.test(`${section.type} ${text}`)) {
    shots.push("材质近拍：自然光、对焦清楚，展示真实纹理、织法或表面工艺，不使用滤镜改变质感");
  }
  if (/扣|连接|接口|开合|安装|closure|connector|clasp/i.test(text)) {
    shots.push("扣具/连接位置特写：正面与侧面；涉及开合或安装时补充打开、闭合两种实拍状态");
  }
  if (/尺寸|规格|参数|SPECS|size|dimension/i.test(`${section.type} ${text}`)) {
    shots.push("尺寸或规格实拍：同一视角的完整商品与测量示意；只使用已确认的数值，不让 AI 估算");
  }
  if (/对比|COMPARISON|compar/i.test(`${section.type} ${text}`)) {
    shots.push("对比对象在相同角度、光线与比例下的实拍，并注明每张图对应的款式及真实差异");
  }
  if (/DETAIL_CLOSEUP|细节|detail/i.test(`${section.type} ${text}`) && shots.length === 1) {
    shots.push(`围绕“${section.title}”涉及部位的清晰局部特写，以及能定位该部位的完整商品图`);
  }
  if (shots.length === 1) shots.push("与本模块构图一致的正面或 45° 实拍；需要背面、侧面时另补对应视角");
  return shots;
}

export function productFidelityGuard(referenceCount: number) {
  return [
    "Product fidelity constraints: source product photos and explicit product facts are authoritative. Preserve the exact silhouette, proportions, construction, connectors, fasteners, material texture, SKU color and authentic markings. Never merge parts or colors from different variants. Do not turn an accessory into the host device or include items explicitly excluded from the sale.",
    referenceCount <= 1
      ? "Only one or no product reference is available. Stay with the visible product angle and structure. Do not invent a hidden back, underside, new connector, exploded view or mechanism; use the supplied angle and composition instead. A crop cannot recover unseen detail."
      : "Multiple references do not prove every angle or detail is covered. Use only views and features actually evidenced by the same SKU references. Never fabricate a missing view or mechanism.",
    "If the requested scene conflicts with product fidelity, retain the source product geometry and simplify the scene. No invented measurements, compatibility, materials, functions or claims.",
  ].join("\n");
}
