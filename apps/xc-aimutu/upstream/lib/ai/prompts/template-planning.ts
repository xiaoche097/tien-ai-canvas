export function templatePlanningContext(snapshot: unknown, includeModules = true): string {
  const application = (snapshot as any)?.templateApplication;
  if (!application) return "";
  const structure = application.structure ?? {};
  const profile = application.styleProfile ?? {};
  const visualStyle = {
    overallStyle: profile.overallStyle ?? structure.overallStyle,
    colorPalette: profile.colorPalette ?? structure.colorPalette,
    typography: profile.typography ?? structure.typography,
    ...(includeModules && { layoutExamples: (structure.modules ?? []).map((module: any) => ({
      role: module.type, styleNotes: module.styleNotes, textLayout: module.textLayout, bgType: module.bgType,
    })) }),
  };
  return `\n\n所选套版的视觉风格参考（不是商品事实或固定模块清单）：\n${JSON.stringify(visualStyle)}\n仅迁移配色、字体、留白和排版语言。必须依据当前商品分析重新规划主题、卖点、模块文案与图片内容；不得沿用模板原商品的名称、材质、结构、功能或参数。严格使用用户配置的头图/详情数量、比例及语言，按新商品适配布局；Amazon 第一张白底主图的无营销文字要求优先。`;
}
