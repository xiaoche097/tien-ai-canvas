"use client";

import { useState, type ReactNode } from "react";
import { Focus, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkbenchPageFrame({ title, header, configuration, children }: {
  title: string; header: ReactNode; configuration: ReactNode; children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return <div className="motu-workbench-page" data-focused={focused}>
    <div className="motu-workbench-command-row">
      <div className="motu-workbench-heading min-w-0 flex-1" hidden={focused}>{header}</div>
      {focused && <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</span>}
      <Button size="sm" variant="outline" aria-pressed={focused} onClick={() => setFocused((value) => !value)}>
        {focused ? <Minimize2 className="h-4 w-4" /> : <Focus className="h-4 w-4" />}{focused ? "退出专注" : "专注预览"}
      </Button>
    </div>
    <details className="motu-workbench-configuration text-xs text-muted-foreground" hidden={focused}>
      <summary className="w-fit cursor-pointer">项目配置与说明</summary>
      <div className="motu-workbench-summary mt-2">{configuration}</div>
      <p className="py-2">左侧选择模块，中间切换商品预览，右侧编辑及管理版本。拖动分隔条调整宽度，也可聚焦后用方向键调整。</p>
    </details>
    {children}
  </div>;
}
