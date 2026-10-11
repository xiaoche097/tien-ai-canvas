/** 主导航专用图形：轮廓与实心状态分别绘制，应用市场选中时显示三面色块。 */
export function WorkspaceNavIcon({ section, active }: { section: "create" | "projects" | "canvas" | "apps" | "news"; active: boolean }) {
    return (
        <svg className="workspace-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {section === "create" && (
                <>
                    <path d="M3.5 10.5 12 3.5l8.5 7v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z" fill={active ? "currentColor" : "none"} />
                    <path d="M10 21v-6h4v6" stroke={active ? "var(--workspace-nav-icon-cutout)" : "currentColor"} />
                </>
            )}
            {section === "projects" && (
                <>
                    <path d="m3.5 7 15.9-3.4 1.1 5.2L4.6 12.2Z" fill={active ? "currentColor" : "none"} />
                    <path d="m7.5 6.2 3 4.8m3-6.1 3 4.8" stroke={active ? "var(--workspace-nav-icon-cutout)" : "currentColor"} />
                    <path d="M4.6 12.2h15.9v7.3A1.5 1.5 0 0 1 19 21H6.1a1.5 1.5 0 0 1-1.5-1.5Z" fill={active ? "currentColor" : "none"} />
                    {active && <path d="m10.5 14.5 4 2.2-4 2.3Z" fill="var(--workspace-nav-icon-cutout)" stroke="none" />}
                </>
            )}
            {section === "canvas" && (
                <>
                    <rect x="3" y="3" width="7" height="7" rx="1.5" fill={active ? "currentColor" : "none"} />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" fill={active ? "currentColor" : "none"} opacity={active ? ".6" : "1"} />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" fill={active ? "currentColor" : "none"} opacity={active ? ".6" : "1"} />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" fill={active ? "currentColor" : "none"} />
                </>
            )}
            {section === "apps" && (
                <g stroke="none">
                    <path d="M12 2 22 7.5 12 13 2 7.5Z" fill={active ? "var(--workspace-nav-cube-top)" : "currentColor"} />
                    <path d="M2 7.5 12 13v9L2 16.5Z" fill={active ? "var(--workspace-nav-cube-left)" : "currentColor"} opacity={active ? "1" : ".7"} />
                    <path d="m12 13 10-5.5v9L12 22Z" fill={active ? "var(--workspace-nav-cube-right)" : "currentColor"} opacity={active ? "1" : ".45"} />
                </g>
            )}
            {section === "news" && (
                <>
                    <path d="M5.5 7H3v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3H7v15.5a2.5 2.5 0 0 1-5 0" fill={active ? "currentColor" : "none"} />
                    <g stroke={active ? "var(--workspace-nav-icon-cutout)" : "currentColor"}>
                        <path d="M11 7h6M11 11h6M11 15h6" />
                    </g>
                </>
            )}
        </svg>
    );
}
