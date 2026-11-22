import { useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { appearanceLogoURL, useAppearanceStore } from "@/stores/use-appearance-store";
import type { ThemeName } from "@/stores/use-theme-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import "./brand-logo-effects.css";

type BrandLogoProps = {
    className?: string;
    fallback: ReactNode;
    alt?: string;
    theme?: ThemeName | "auto";
};

export function BrandLogo({ className, fallback, alt = "", theme = "auto" }: BrandLogoProps) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const currentTheme = useActiveTheme();
    const configured = appearance.logoConfigured || appearance.darkLogoConfigured;
    const builtin = !configured && appearance.brandName === "境彻" && appearance.brandSlug === "open-ai-canvas";
    const resolvedTheme = theme === "auto" ? currentTheme : theme;
    const source = builtin ? `${import.meta.env.BASE_URL || "/"}jingche-logo.png?v=2` : appearanceLogoURL(appearance, resolvedTheme);
    const [failedSource, setFailedSource] = useState<string | null>(null);
    if (!configured && !builtin) return <>{fallback}</>;
    // A configured custom logo must never fall through to the built-in brand
    // when its file becomes unavailable. Keep its footprint neutral instead.
    if (failedSource === source) return <span className={cn("block", className)} aria-hidden="true" />;
    return (
        <img
            src={source}
            alt={alt}
            className={cn("block object-contain", className)}
            style={builtin && resolvedTheme === "dark" ? { filter: "invert(1)" } : undefined}
            draggable={false}
            onError={(event) => {
                event.currentTarget.style.visibility = "hidden";
                setFailedSource(source);
            }}
        />
    );
}

export function BrandLogoFrame({ className, logoClassName, fallback, alt = "", theme = "auto", polish = false }: BrandLogoProps & { logoClassName?: string; polish?: boolean }) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const frameEnabled = appearance.logoFrameEnabled;
    const builtin = !appearance.logoConfigured && !appearance.darkLogoConfigured && appearance.brandName === "境彻" && appearance.brandSlug === "open-ai-canvas";
    const unframedStyle: CSSProperties | undefined = frameEnabled && !builtin
        ? undefined
        : {
              background: "transparent",
              borderColor: "transparent",
              borderRadius: 0,
              boxShadow: "none",
              color: "inherit",
          };
    return (
        <span className={cn("brand-logo-frame", polish && "brand-logo-polish", className)} data-logo-frame-enabled={frameEnabled} style={unframedStyle}>
            <BrandLogo className={logoClassName} fallback={fallback} alt={alt} theme={theme} />
        </span>
    );
}
