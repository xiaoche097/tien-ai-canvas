"use client";

import ProviderSettingsPageClient from "@/components/providers/provider-settings-page-client";
import CanvasModelSettings from "@/components/providers/canvas-model-settings";

export default function ProviderSettingsPage() {
  return process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" ? <CanvasModelSettings /> : <ProviderSettingsPageClient />;
}
