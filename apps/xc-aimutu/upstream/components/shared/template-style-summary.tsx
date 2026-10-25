export function TemplateStyleSummary({ snapshot }: { snapshot: unknown }) {
  const template = (snapshot as any)?.templateApplication;
  if (!template?.name) return null;
  const style = template.styleProfile?.overallStyle || template.structure?.overallStyle;
  return <div className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm" aria-label="当前套版">
    <p className="font-medium">当前套版：{template.name}</p>
    {style && <p className="text-muted-foreground">套版风格：{style}</p>}
    <p className="text-xs text-muted-foreground">规划和出图沿用这套模板的配色、字体与排版，新商品内容以本项目分析为准。</p>
  </div>;
}
