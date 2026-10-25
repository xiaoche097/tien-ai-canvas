"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { PanelLeft, PanelRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Side = "left" | "right";
type Layout = { left: number; right: number; leftCollapsed: boolean; rightCollapsed: boolean };
export const workbenchLayoutKey = "motu:workbench-layout:v1";
const defaults: Layout = { left: 240, right: 320, leftCollapsed: false, rightCollapsed: false };
const limits = { left: [220, 320], right: [300, 400] } as const;

export function readWorkbenchLayout(value: string | null): Layout {
  try {
    const saved = JSON.parse(value ?? "null");
    return {
      left: typeof saved?.left === "number" && Number.isFinite(saved.left) ? Math.min(320, Math.max(220, saved.left)) : defaults.left,
      right: typeof saved?.right === "number" && Number.isFinite(saved.right) ? Math.min(400, Math.max(300, saved.right)) : defaults.right,
      leftCollapsed: saved?.leftCollapsed === true,
      rightCollapsed: saved?.rightCollapsed === true,
    };
  } catch { return { ...defaults }; }
}

export function WorkbenchLayout({ expanded, left, preview, right, children }: {
  expanded: boolean; left: ReactNode; preview: ReactNode; right: ReactNode; children?: ReactNode;
}) {
  const [layout, setLayout] = useState<Layout>(defaults);
  const [width, setWidth] = useState(0);
  const [overlay, setOverlay] = useState<Side | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<{ side: Side; start: number; width: number; current: number } | null>(null);
  useEffect(() => {
    try { setLayout(readWorkbenchLayout(localStorage.getItem(workbenchLayoutKey))); } catch { /* Storage can be unavailable in private browsing. */ }
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const save = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(workbenchLayoutKey, JSON.stringify(next)); } catch { /* Keep the current session usable without storage. */ }
  };
  // Keep at least 640px for the preview. At narrow sizes panels open over the
  // preview on demand; the business components stay mounted in their slots.
  const narrowRight = width > 0 && width < layout.right + 652;
  const narrowLeft = width > 0 && width < layout.left + (layout.rightCollapsed ? 0 : layout.right + 12) + 652;
  const shown = (side: Side) => !expanded && (side === "left" ? narrowLeft ? overlay === side : !layout.leftCollapsed : narrowRight ? overlay === side : !layout.rightCollapsed);
  const overlayActive = !expanded && ((overlay === "left" && narrowLeft) || (overlay === "right" && narrowRight));
  const toggle = (side: Side) => {
    if (side === "left" ? narrowLeft : narrowRight) setOverlay(overlay === side ? null : side);
    else save({ ...layout, [side === "left" ? "leftCollapsed" : "rightCollapsed"]: shown(side) });
  };
  const finish = () => {
    if (!drag.current) return;
    const { side, current } = drag.current;
    drag.current = null;
    grid.current?.removeAttribute("data-resizing");
    save({ ...layout, [side]: current });
  };
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const active = drag.current;
    const direction = active.side === "left" ? 1 : -1;
    const otherWidth = active.side === "left" ? (shown("right") ? layout.right + 12 : 0) : (shown("left") ? layout.left + 12 : 0);
    const maximum = Math.min(limits[active.side][1], Math.max(limits[active.side][0], width - otherWidth - 652));
    active.current = Math.round(Math.max(limits[active.side][0], Math.min(maximum, active.width + direction * (event.clientX - active.start))));
    grid.current?.style.setProperty(`--${active.side}-width`, `${active.current}px`);
    event.currentTarget.setAttribute("aria-valuenow", String(active.current));
  };
  const separator = (side: Side) => <div
    className={`motu-workbench-separator motu-separator-${side}`}
    role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={side === "left" ? "调整模块树宽度" : "调整编辑面板宽度"}
    aria-controls={`workbench-${side}-panel`}
    aria-valuemin={limits[side][0]} aria-valuemax={limits[side][1]} aria-valuenow={layout[side]}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { side, start: event.clientX, width: layout[side], current: layout[side] };
      grid.current?.setAttribute("data-resizing", "true");
    }}
    onPointerMove={resize} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 20 : 10;
      const direction = (event.key === "ArrowRight" ? 1 : -1) * (side === "left" ? 1 : -1);
      const next = event.key === "Home" ? limits[side][0] : event.key === "End" ? limits[side][1] : layout[side] + direction * step;
      save({ ...layout, [side]: Math.min(limits[side][1], Math.max(limits[side][0], next)) });
    }}
  ><span /></div>;

  return <div className="motu-workbench-layout" onKeyDown={(event) => { if (event.key === "Escape" && overlayActive) { setOverlay(null); (event.currentTarget.querySelector(`[aria-controls="workbench-${overlay}-panel"]`) as HTMLElement)?.focus(); } }}>
    <div className="motu-workbench-tools" role="group" aria-label="工作台布局">
      <Button size="sm" variant="ghost" disabled={expanded} aria-expanded={shown("left")} aria-controls="workbench-left-panel" onClick={() => toggle("left")}><PanelLeft className="h-4 w-4" />模块树</Button>
      <Button size="sm" variant="ghost" disabled={expanded} aria-expanded={shown("right")} aria-controls="workbench-right-panel" onClick={() => toggle("right")}><PanelRight className="h-4 w-4" />编辑面板</Button>
      <details className="relative text-xs">
        <summary className="cursor-pointer rounded-lg px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">面板宽度</summary>
        <div className="absolute right-0 top-full z-30 mt-1 w-56 space-y-2 rounded-xl border border-border bg-card p-3 shadow-lg">
          {(["left", "right"] as const).map((side) => <div key={side} className="flex items-center justify-between gap-2">
            <span>{side === "left" ? "模块树" : "编辑面板"} {layout[side]}px</span>
            <div className="flex gap-1">{([-10, 10] as const).map((delta) => <Button key={delta} size="sm" variant="outline" aria-label={`${delta < 0 ? "缩小" : "增大"}${side === "left" ? "模块树" : "编辑面板"}宽度`} onClick={() => save({ ...layout, [side]: Math.min(limits[side][1], Math.max(limits[side][0], layout[side] + delta)) })}>{delta < 0 ? "−" : "+"}</Button>)}</div>
          </div>)}
        </div>
      </details>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { save({ ...defaults }); setOverlay(null); }}><RotateCcw className="h-3.5 w-3.5" />恢复默认布局</Button>
    </div>
    <div ref={grid} className="motu-editor-grid" data-left={shown("left")} data-right={shown("right")} data-left-overlay={narrowLeft} data-right-overlay={narrowRight}
      style={{ "--left-width": `${layout.left}px`, "--right-width": `${layout.right}px` } as CSSProperties}>
      <div id="workbench-left-panel" className="motu-workbench-left" hidden={!shown("left")}>{left}</div>
      {separator("left")}
      <div className="motu-workbench-preview">{preview}</div>
      {separator("right")}
      <div id="workbench-right-panel" className="motu-workbench-right" hidden={!shown("right")}>{right}</div>
      {overlayActive && <button className="motu-workbench-backdrop" aria-label="关闭临时面板" onClick={() => setOverlay(null)} />}
    </div>
    {children}
  </div>;
}
