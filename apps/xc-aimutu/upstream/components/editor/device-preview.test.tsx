import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { ProjectOutputConfigCard } from "@/components/shared/project-output-config-card";
import { platformOptions } from "@/types/domain";
import { projectUpdateSchema } from "@/lib/validations/project";
import { useEditorStore } from "@/hooks/use-editor-store";
import { DesktopPreview } from "./desktop-preview";
import { previewScale, resolvePreviewDevice } from "./preview-state";

test("Amazon defaults to desktop; every other supported platform defaults to mobile", () => {
  for (const platform of platformOptions) assert.equal(resolvePreviewDevice(platform), platform === "amazon" ? "desktop" : "mobile");
  assert.equal(resolvePreviewDevice("unknown"), "mobile");
});

test("output configuration identifies the saved template in analysis and planning views", () => {
  const project = { id: "template-project", platform: "amazon", modelSnapshot: { templateApplication: { name: "女性表带模板", styleProfile: { overallStyle: "简约粉色" } } } };
  for (const editable of [true, false]) {
    const html = renderToStaticMarkup(<AppRouterContext.Provider value={{ refresh() {} } as any}><ProjectOutputConfigCard project={project} editable={editable} /></AppRouterContext.Provider>);
    assert.match(html, /当前套版：女性表带模板/);
    assert.match(html, /套版风格：简约粉色/);
  }
});

test("manual device choice is project-scoped and platform changes use the new default", () => {
  useEditorStore.setState({ selectedSectionId: "editing-module", previewDevices: {} });
  useEditorStore.getState().setPreviewDevice("a", "amazon", "mobile");
  const state = useEditorStore.getState();
  assert.equal(resolvePreviewDevice("amazon", state.previewDevices.a), "mobile");
  assert.equal(resolvePreviewDevice("amazon", state.previewDevices.b), "desktop");
  assert.equal(resolvePreviewDevice("taobao_tmall", state.previewDevices.a), "mobile");
  assert.equal(state.selectedSectionId, "editing-module");
  useEditorStore.setState({ selectedSectionId: null, previewDevices: {} });
});

test("fit remains inside narrow and wide canvases; explicit zoom keeps logical dimensions", () => {
  for (const device of ["desktop", "mobile"] as const) {
    for (const width of [288, 480, 1440]) {
      const scale = previewScale("fit", width, 700, device);
      assert.ok(scale * (device === "desktop" ? 1000 : 396) <= width - 32);
      if (device === "mobile") assert.ok(scale * 780 <= 668);
      else assert.ok(Math.abs(scale * 1000 - (width - 32)) < 0.001, "desktop fills available width and adapts its height");
    }
    for (const zoom of [50, 75, 100] as const) assert.equal(previewScale(zoom, 288, 700, device), zoom / 100);
  }
});

test("output card offers all existing platforms and sends a valid existing project field", () => {
  const modelSnapshot = { previewConfig: { heroAspectRatio: "3:4", imageAspectRatio: "9:16" } };
  const html = renderToStaticMarkup(<AppRouterContext.Provider value={{ refresh() {} } as any}><ProjectOutputConfigCard editable project={{ id: "project", platform: "amazon", modelSnapshot }} /></AppRouterContext.Provider>);
  assert.match(html, /id="output-platform"/);
  for (const platform of platformOptions) assert.match(html, new RegExp(`value="${platform}"`));
  assert.match(html, /value="amazon" selected=""/);
  assert.deepEqual(projectUpdateSchema.parse({ platform: "amazon", modelSnapshot }), { platform: "amazon", modelSnapshot });
});

test("desktop renders current images at natural ratios without inventing price or reviews", () => {
  const project = { name: "实际商品", sections: [{ id: "hero", type: "HERO", title: "当前版本", imageUrl: "/current.png" }, { id: "detail", type: "DETAIL_CLOSEUP", title: "细节", imageUrl: "/detail.png" }], assets: [], modelSnapshot: { previewConfig: { heroAspectRatio: "3:4" } } };
  const html = renderToStaticMarkup(<DesktopPreview project={project} selectedHeroIndex={0} onSelectHeroIndex={() => {}} onOpenLightbox={() => {}} />);
  assert.match(html, /src="\/current.png"/);
  assert.match(html, /src="\/detail.png"/);
  assert.match(html, /未配置/);
  assert.doesNotMatch(html, /4\.9|销量|真实反馈|object-cover|object-contain/);
  assert.match(html, /class="block h-auto w-full"/);
});
