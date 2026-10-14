# 摹图上游源码

- 上游仓库：<https://github.com/xiaoche0907/xc-aimutu>
- 导入版本：`b31b5a5de8aefae07ec3ad8554980aaa0884cbe5`（`main`）
- `upstream/` 保留该版本的原始目录结构和 UI。境彻接入代码已在该目录内以 `CANVAS_INTEGRATION` 分支实现；更新上游时需逐项复核这些本地差异。
- 上游追踪的 `auth-server/prisma/dev.db` 是运行数据，未导入；其余 260 个追踪文件已导入并逐个校验 SHA-256。数据库和本地运行产物继续按 `.gitignore` 排除。
- 根目录 Dockerfile 与 `web/` 依赖未引入摹图。电商设计室使用独立 Dockerfile、Compose 服务和 `/motu/` 代理；创意中心入口与旧地址均指向 `/motu`。本地主入口已完成试用，生产镜像发布、部署及回滚演练仍待完成。

接入步骤、权限和发布门槛见 [集成计划](../../docs/plans/xc-aimutu-integration.md)。同步上游时以记录的 commit 为基线比对本地改动，再逐项合并和验证。
