"use client";

import { useEffect } from "react";

export function CanvasFavicon() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CANVAS_INTEGRATION !== "1") return;

    let active = true;
    let observer: MutationObserver | undefined;
    const url = new URL("/api/public/appearance", window.location.origin);
    fetch(url).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      const appearance = result?.code === 0 ? result.data?.appearance : null;
      if (!active || !appearance) return;

      const update = () => {
        const logo = document.documentElement.classList.contains("dark")
          ? appearance.darkLogoUrl || appearance.logoUrl
          : appearance.logoUrl || appearance.darkLogoUrl;
        if (typeof logo !== "string" || !logo) return;
        document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((link) => {
          link.removeAttribute("type");
          link.href = logo;
        });
        const icon = document.querySelector<HTMLLinkElement>('link[data-canvas-favicon]') ?? document.createElement("link");
        icon.rel = "icon";
        icon.dataset.canvasFavicon = "";
        icon.href = logo;
        if (!icon.isConnected) document.head.appendChild(icon);
      };

      update();
      observer = new MutationObserver(update);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      observer.observe(document.head, { childList: true });
    }).catch(() => {});

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, []);

  return null;
}
