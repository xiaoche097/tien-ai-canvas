import { Tabs } from "antd";
import { Store } from "lucide-react";

import PluginsPage from "@/pages/plugins";
import SkillsPage from "@/pages/skills";
import { useUserStore } from "@/stores/use-user-store";

/** 应用市场：技能与插件合并在一个入口，页内分区展示，旧路由 /skills、/plugins 保留直达。 */
export default function AppsPage() {
    const pluginCenterEnabled = useUserStore((state) => state.features.pluginCenterEnabled);

    return (
        <div className="apps-page">
            <div className="apps-page-header">
                <span className="apps-page-icon" aria-hidden>
                    <Store className="size-5" strokeWidth={1.6} />
                </span>
                <div>
                    <h1 className="apps-page-title">应用市场</h1>
                    <p className="apps-page-subtitle">技能与插件集中管理，扩展你的创作能力</p>
                </div>
            </div>
            <Tabs className="apps-page-tabs" defaultActiveKey="skills" items={[{ key: "skills", label: "技能", children: <SkillsPage /> }, ...(pluginCenterEnabled ? [{ key: "plugins", label: "插件", children: <PluginsPage /> }] : [])]} />
        </div>
    );
}
