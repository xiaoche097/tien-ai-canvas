import { Popover } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { ChevronDown, LogIn, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { AppChangelogButton } from "@/components/layout/app-changelog-modal";
import { WorkspaceAccountCard } from "./workspace-account-card";
import { UserAvatar } from "./user-avatar";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

/** 顶部与侧栏复用同一账户卡片；顶部额外保留版本和主题偏好。 */
export function WorkspaceAccountMenu() {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);
    const [menuOpen, setMenuOpen] = useState(false);
    const displayName = user?.displayName.trim() || user?.username.trim() || "用户";
    const initial = Array.from(displayName)[0];

    if (!hydrated) {
        return <span className="size-9 animate-pulse rounded-[var(--r-md)] bg-foreground/[.06]" aria-hidden />;
    }

    return user ? (
        <><Popover
            trigger={["hover", "click"]}
            mouseEnterDelay={0.15}
            mouseLeaveDelay={0.2}
            placement="bottomRight"
            arrow={false}
            rootClassName="workspace-account-popover"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            content={(
                <div className="workspace-topbar-account-menu">
                    <WorkspaceAccountCard onNavigate={() => setMenuOpen(false)} onWallet={() => { setMenuOpen(false); openWorkspaceWallet(); }}>

                        <div className="workspace-topbar-account-section">
                            <AppChangelogButton className="flex h-8 w-full items-center gap-2 rounded px-2 text-[var(--fs-label)] text-foreground/58 hover:bg-surface-hover hover:text-foreground [&_svg]:size-3.5" showLabel showVersion versionClassName="ml-auto text-[var(--fs-micro)] tabular-nums text-foreground/32" />
                        </div>

                        <div className="workspace-topbar-account-theme">
                            {theme === "dark" ? <Moon className="size-3.5 text-foreground/45" /> : <Sun className="size-3.5 text-foreground/45" />}
                            <span className="ml-2 flex-1 text-xs text-foreground/65">深色模式</span>
                            <Switch size="sm" checked={theme === "dark"} onChange={(checked) => setTheme(checked ? "dark" : "light")} aria-label="深色模式" />
                        </div>
                    </WorkspaceAccountCard>
                </div>
            )}
        >
            <button type="button" className="app-workspace-account-trigger" aria-label="账户菜单" aria-expanded={menuOpen} aria-haspopup="dialog" title={displayName}>
                <span className="app-workspace-account-initial" aria-hidden="true">{initial}</span>
                <span className="app-workspace-account-name">{displayName}</span>
                <ChevronDown className="app-workspace-account-chevron" aria-hidden="true" />
                <UserAvatar user={user} className="app-workspace-account-avatar" />
            </button>
        </Popover></>
    ) : (
        <Link to="/login" className="app-workspace-topbar-icon-button" aria-label="登录" title="登录">
            <LogIn />
        </Link>
    );
}
