import { Clapperboard, House, Images, ListTodo, Newspaper, PanelLeftClose, PanelLeftOpen, PanelsTopLeft, Store, WandSparkles } from "lucide-react";
import { Link, useLocation } from "react-router";

import { BrandLogoFrame } from "@/components/brand/brand-logo";
import { SystemAnnouncementCenter } from "@/components/layout/system-announcement-center";
import { WorkspaceAccountMenu } from "@/components/layout/workspace-account-menu";
import { WorkspaceCreditGiftMark } from "@/components/layout/workspace-credit-gift-mark";
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import { openWorkspaceWallet } from "@/lib/workspace-wallet";
import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

/** 顶部五大类目：创作 / 创意中心 / 工作空间 / 应用市场 / 资讯（资讯为占位入口）。 */
const NAV_SECTIONS = [
    { id: "create", title: "创作", to: "/", icon: House },
    { id: "projects", title: "创意中心", to: "/projects", icon: Clapperboard },
    { id: "canvas", title: "工作空间", to: "/canvas", icon: PanelsTopLeft },
    { id: "apps", title: "应用市场", to: "/apps", icon: Store },
    { id: "news", title: "资讯", to: "/news", icon: Newspaper },
] as const;

export function WorkspaceTopBar({ mobileOpen, onToggleMobile }: { mobileOpen: boolean; onToggleMobile: () => void }) {
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const features = useUserStore((state) => state.features);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { availableMicrocredits } = useWalletBalance(user?.id, creditsEnabled);
    const { pathname } = useLocation();
    const slug = pathname.split("/").filter(Boolean)[0] || "create";
    const balance = availableMicrocredits === null ? "--" : (availableMicrocredits / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 });

    return (
        <header className="app-workspace-topbar app-workspace-topnav">
            <div className="app-workspace-topnav-left">
                <button type="button" className="app-workspace-mobile-menu app-workspace-topbar-icon-button lg:hidden" aria-label={mobileOpen ? "收起导航" : "展开导航"} onClick={onToggleMobile}>
                    {mobileOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                </button>
                <Link to="/" className="app-workspace-topnav-brand" aria-label={`${brandName}首页`} title={brandName}>
                    <BrandLogoFrame className="grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] shadow-sm" logoClassName="size-[22px] object-contain" alt="" fallback={<WandSparkles className="size-5" strokeWidth={2.2} />} />
                    <span className="truncate text-[20px] leading-none font-semibold">{brandName}</span>
                </Link>
            </div>

            <nav className="app-workspace-topnav-items" aria-label="主导航">
                {NAV_SECTIONS.map((item) => {
                    const Icon = item.icon;
                    const isActive = slug === item.id;
                    return (
                        <Link key={item.id} to={item.to} className={cn("app-workspace-topnav-item", isActive && "is-active")} aria-current={isActive ? "page" : undefined}>
                            <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                            <span>{item.title}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="app-workspace-topbar-actions app-workspace-topnav-actions">
                <Link to="/assets" className="app-workspace-topbar-icon-button" aria-label="资产" title="资产">
                    <Images className="size-4" strokeWidth={1.8} />
                </Link>
                {features.taskCenterEnabled ? (
                    <Link to="/tasks" className="app-workspace-topbar-icon-button" aria-label="创作历史" title="创作历史">
                        <ListTodo className="size-4" strokeWidth={1.8} />
                    </Link>
                ) : null}
                {user ? <SystemAnnouncementCenter userId={user.id} className="app-workspace-topbar-icon-button" autoOpen /> : null}
                <AnimatedThemeToggler className="app-workspace-topbar-icon-button" theme={theme} onThemeChange={setTheme} aria-label="切换主题" />
                {creditsEnabled ? (
                    <button type="button" className="app-workspace-topbar-credit-pill" aria-label={`打开积分中心，可用 ${balance} 积分`} onClick={() => openWorkspaceWallet()}>
                        <WorkspaceCreditGiftMark />
                        <span>积分</span>
                        <strong>{balance}</strong>
                    </button>
                ) : null}
                <WorkspaceAccountMenu />
            </div>

            {mobileOpen ? (
                <div className="app-workspace-topnav-mobile" aria-label="移动端导航">
                    {NAV_SECTIONS.map((item) => {
                        const Icon = item.icon;
                        const isActive = slug === item.id;
                        return (
                            <Link key={item.id} to={item.to} onClick={onToggleMobile} className={cn("app-workspace-topnav-mobile-item", isActive && "is-active")} aria-current={isActive ? "page" : undefined}>
                                <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                                <span>{item.title}</span>
                            </Link>
                        );
                    })}
                    <div className="app-workspace-topnav-mobile-divider" aria-hidden />
                    <Link to="/assets" onClick={onToggleMobile} className="app-workspace-topnav-mobile-item">
                        <Images className="size-4 shrink-0" strokeWidth={1.8} />
                        <span>资产</span>
                    </Link>
                    {features.taskCenterEnabled ? (
                        <Link to="/tasks" onClick={onToggleMobile} className="app-workspace-topnav-mobile-item">
                            <ListTodo className="size-4 shrink-0" strokeWidth={1.8} />
                            <span>创作历史</span>
                        </Link>
                    ) : null}
                </div>
            ) : null}
        </header>
    );
}
