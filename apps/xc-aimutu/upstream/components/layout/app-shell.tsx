"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { ArrowLeft, Clapperboard, FolderKanban, GalleryVerticalEnd, History, Images, KeyRound, LayoutTemplate, LogOut, Menu, Settings2, User, X } from "lucide-react";
import { toast } from "sonner";

import { ApiUsageIndicator } from "@/components/layout/api-usage-indicator";
import { FloatingThemeToggle } from "@/components/layout/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth-store";
import { useBrandStore } from "@/hooks/use-brand-store";

const navItems = [
  { href: "/", label: "快速开始", icon: FolderKanban },
  { href: "/history", label: "历史记录", icon: History },
  { href: "/projects/new", label: "高级创建", icon: GalleryVerticalEnd },
  { href: "/templates", label: "套版中心", icon: LayoutTemplate },
  { href: "/hero-batch", label: "批量主图", icon: Images },
  { href: "/models", label: "模特库", icon: User },
  { href: "/video", label: "视频生成", icon: Clapperboard },
];

function KeyTypeBadge({ type }: { type: string | undefined }) {
  if (!type) return null;
  const map: Record<string, { label: string; className: string }> = {
    PER_USE: { label: "次卡", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    DAILY: { label: "日卡", className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
    MONTHLY: { label: "月卡", className: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  };
  const cfg = map[type] ?? { label: type, className: "" };
  return <Badge variant="outline" className={cn("text-[10px]", cfg.className)}>{cfg.label}</Badge>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { keyInfo, clearKey } = useAuthStore();
  const { brandName, companyName, version } = useBrandStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeMobileNavigation = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener("change", closeMobileNavigation);
    return () => desktop.removeEventListener("change", closeMobileNavigation);
  }, []);

  const handleLogout = async () => {
    if (process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1") {
      try {
        const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok || payload.code !== 0) throw new Error("退出登录失败");
        clearKey();
        window.location.assign("/login");
      } catch {
        toast.error("退出登录失败，请重试");
      }
      return;
    }
    clearKey();
    toast.success("已登出");
    router.replace("/login");
  };

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
  const navLinkClass = (href: string) => cn(
    "motu-nav-link flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    isActive(href) ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

  return (
    <div className={cn("motu-shell min-h-[100dvh] text-foreground", /^\/projects\/[^/]+\/editor\/?$/.test(pathname) && "motu-workbench")}>
      <div className="motu-shell-frame flex min-h-[100dvh] w-full min-w-0">
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 md:hidden" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-[80] flex w-[min(18rem,calc(100vw-2rem))] flex-col overflow-y-auto border-r border-border bg-card p-4 shadow-xl focus:outline-none md:hidden">
              <Dialog.Title className="sr-only">电商设计室导航</Dialog.Title>
              <Dialog.Description className="sr-only">选择工作区，或返回境彻创意中心</Dialog.Description>
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 bg-black text-sm font-semibold text-white dark:border-white/10 dark:bg-white dark:text-black">
                {process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" ? "电" : "M"}
              </div>
              <span className="text-base font-semibold text-slate-950 dark:text-white">{brandName}</span>
            </Link>
            <Button variant="ghost" size="sm" className="h-11 w-11 p-0" aria-label="关闭导航" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <nav className="mt-6 space-y-2">
            {process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" && (
              <a href="/projects" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-white" onClick={() => setMobileOpen(false)}>
                <ArrowLeft className="h-4 w-4" />
                返回创意中心
              </a>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className={navLinkClass(item.href)} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setMobileOpen(false)}>
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 pt-6">
            {keyInfo && (
              <div className="rounded-[1.25rem] border border-white/80 bg-white/68 p-4 dark:border-white/10 dark:bg-[#141416]/88">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyTypeBadge type={keyInfo.type} />
                    <span className="text-[10px] text-slate-400">
                      积分 {keyInfo.balance ?? 0}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleLogout} title="登出">
                    <LogOut className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                </div>
                <code className="mt-1 block truncate text-[10px] text-slate-500 font-mono">{keyInfo.key}</code>
              </div>
            )}
            <p className="text-xs text-slate-400">{companyName} · v{version}</p>
          </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Desktop sidebar */}
        <aside className="motu-sidebar hidden shrink-0 flex-col md:flex">
          {process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" ? (
            <Link href="/" className="flex items-center gap-3 px-2 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-card">电</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{brandName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">境彻创意中心</p>
              </div>
            </Link>
          ) : (
            <Link href="/" className="flex items-center gap-3 rounded-2xl border border-white/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(245,245,245,0.82))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/10 bg-black text-base font-semibold tracking-[-0.06em] text-white dark:border-white/10 dark:bg-white dark:text-black">M</div>
              <div>
                <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">{brandName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">AI 电商详情页生成与编辑工作台</p>
              </div>
            </Link>
          )}

          <nav className="mt-7 space-y-1" aria-label="电商设计室">
            {process.env.NEXT_PUBLIC_CANVAS_INTEGRATION === "1" && (
              <a href="/projects" className="mb-5 flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
                返回创意中心
              </a>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(item.href)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3">
            {keyInfo && (
              <div className="rounded-[1.25rem] border border-white/80 bg-white/68 p-4 dark:border-white/10 dark:bg-[#141416]/88">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyTypeBadge type={keyInfo.type} />
                    {keyInfo.type === "PER_USE" ? (
                      <span className="text-[10px] text-slate-400">
                        {keyInfo.usedCount >= 1 ? "已用完" : "剩余 1 次"}
                      </span>
                    ) : keyInfo.expiresAt ? (
                      <span className="text-[10px] text-slate-400">
                        {new Date(keyInfo.expiresAt) > new Date()
                          ? `有效期至 ${new Date(keyInfo.expiresAt).toLocaleDateString("zh-CN")}`
                          : `已过期 ${new Date(keyInfo.expiresAt).toLocaleDateString("zh-CN")}`}
                      </span>
                    ) : null}
                    <span className="text-[10px] font-medium text-amber-500">
                      积分 {keyInfo.balance ?? 0}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleLogout} title="登出">
                    <LogOut className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                </div>
                <code className="mt-1 block truncate text-[10px] text-slate-500 font-mono">{keyInfo.key}</code>
              </div>
            )}
            <div className="border-t border-border px-2 pt-4 text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {companyName}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {version}
                </div>
              </div>

              <p className="mt-2 text-xs">开发者 · 小彻</p>
            </div>
          </div>
        </aside>

        <main className="motu-main min-w-0 flex-1">
          <div className="motu-topbar flex items-center justify-between gap-3 border-b border-border">
            <Button variant="ghost" size="sm" className="h-11 w-11 shrink-0 p-0 md:hidden" aria-label="打开导航" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground md:flex">
              <span>电商设计室</span>
              <span aria-hidden>/</span>
              <span className="truncate text-foreground">{navItems.find(item => isActive(item.href))?.label ?? "项目工作区"}</span>
            </div>
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              <Link
                href="/monitor/usage"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "gap-2 px-3",
                )}
              >
                <span className="hidden text-sm font-medium sm:inline">API 监控</span>
                <ApiUsageIndicator />
              </Link>
              <FloatingThemeToggle />
              <Link href="/settings/providers" aria-label="AI 配置" title="AI 配置" className={cn(buttonVariants({ variant: "outline" }), "h-10 w-10 p-0 sm:w-auto sm:px-4")}>
                <Settings2 className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">AI 配置</span>
              </Link>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
