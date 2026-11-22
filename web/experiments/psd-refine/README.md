# PSD 精修：隔离实验与审计报告

当前进度：商品模块接入、专注精修及本地 PSD 导入已在独立 3003 数据副本实现，主 3000 未推广。现状以 `docs/content/docs/progress/psd-phase2-integration.mdx` 为准；下文保留原隔离实验的审计记录。

## 当前结论

用户已确认受控样本往返、隔离保存与重新打开成功。当前推进到 **Phase 2 的真实商品来源只读对接**：3002 可读取正式商品/模块图像并追踪真实来源，精修版本继续隔离保存，见 [Phase 2 来源对接报告](./PHASE2.md)。正式业务入口及商品预览回写仍未接入；保存机制见 [Phase 1 报告](./PHASE1.md)。

当前 35 项专项测试、158 次断言、独立类型检查与构建通过；保存层测试使用真实 SQLite 和文件系统。用户截图已确认商品来源绑定、隔离版本 v3 保存及同源会话识别；新增打开导入原件且保留精修历史、已保存版本 PSD/PNG 直接下载。继续编辑后的内容恢复、原件打开、历史版本下载与正式预览不变仍待浏览器验收。实验服务只在本地开发中间件注册，写入独立验收目录，不能直接当成生产部署方案。

下文 Phase 0 的未接入说明属于当时的审计记录；当前进度以本节和 Phase 1 报告为准。

### 当前推进：可留证的十步往返验收

已补齐「修改文字 → 再次导出 PSD → 重新导入核对修改」的闭环，避免仅凭内存中的文字修改就宣称文件保存正确。PNG/JPG 导出增加浏览器实际解码及尺寸检查。每次执行结束均在下载记录中提供 JSON 报告，包含步骤状态、失败位置、开始/结束时间、文件大小及 SHA-256；报告仅覆盖自动生成的受控样本，不包含账号凭据或商品数据。

新增回归测试专门验证修改丢失、尺寸错误和损坏图片不会被错误标为通过。当前 12 项测试、52 次断言通过，独立类型检查和构建通过。用户在真实浏览器运行后提供截图，显示十步全部通过、`passed` JSON 报告及六个下载记录，并显示 `PHASE0_EDITABLE_TEXT` 文字层和 `PSD EDIT VERIFIED` 文案。本次受控样本的真实 PNG/PSD/JPG 往返已有用户运行证据；执行工具未直接读取该 JSON 报告，也未操作该浏览器。

### 滚动与加载事件修正

- 移除独立的「PSD 精修 / 文件名」工具栏，将导入、导出、全屏、关闭、主题和侧栏切换合并到现有顶栏；就绪状态移入侧栏，桌面端释放原工具栏约 80px 高度。

- 桌面端主工作区填满浏览器剩余高度，取消固定 640px 最小编辑高度，防止左侧记录把编辑器撑高。左侧内容独立滚动，隐藏滚动条；移动端降级界面仍可整页下滑。
- 打开文件和往返验收结束后自动适合窗口；监听实际编辑容器尺寸变化，在窗口调整或侧栏收起后重新适配文档视图，不修改文件尺寸或比例。
- 隐藏实验页及外层文档的可见滚动条，仍保留原生滚动；仅作用于本实验入口，不修改主站或跨域编辑器的滚动条。
- 编辑器底部增加「适合窗口」及上下平移，使用官方 `app.UI.fitTheArea()` / `app.UI.scroll()`；也可在画布内使用滚轮或按住空格拖动。
- 不再将第二次 iframe load 直接判定为会话失效。空闲时以带命令标识的无副作用脚本探测连接；正在处理命令时不插入探测。增加回归测试验证重复探测后仍可导出。
- 热更新复用现有 React root，避免重复创建；Vite 文件访问范围显式包含主 web 和实际 node_modules 目录，以支持仓库内符号链接依赖的字体资源。
- 右侧广告属于免费官方编辑器。实验页默认显示完整编辑器，广告出现时可用底部「遮挡右侧区域」盖住右侧约 300px，「显示右侧区域」可立即恢复。没有修改 iframe 尺寸、源地址或消息通信；广告未出现时开启遮挡也会遮住对应区域，需手动恢复以使用被遮挡的工具。本方案不移除第三方广告请求，也不检测 iframe 内部布局，不作为稳定去广告授权方案。
- 滚动及连接修正时专项测试为 9 通过 / 0 失败；当前新增往返校验回归后为 12 通过 / 0 失败。真实浏览器的滚动、通信和广告布局仍需复测。

已实现独立运行的验证入口、Photopea 通信适配器、文件导入与导出、受控往返验收操作。专项测试、独立类型检查、独立构建和本地 HTTP 检查通过。

**Phase 0 核心受控样本往返已由用户实测通过，整体验收仍有待办。** 工具没有可连接浏览器，截图证据来自用户。此次修正后的自适应布局、明暗主题、关闭重连和复杂 PSD 兼容性仍待复测；不将这些项目自动标为通过，不合并业务入口。

- 实验分支：`experiment/psd-refine-phase0`。
- 基础 Commit：`1919d35a`。本次未创建提交、合并或部署。
- 开始时在 `main`，已有大量暂存、未暂存及未跟踪改动；保留原有工作区，仅新增本目录。
- 页面：`http://localhost:3002`，仅绑定 `127.0.0.1`，`strictPort` 禁止自动换端口。
- 现有 Vite `/motu` 代理默认也指向 3002。实验运行期间不要将主站 `/motu` 当成真实电商服务使用；未修改原代理配置。
- Phase 0 当时未接入身份、业务 API、数据库或上传；Phase 1 现已加入独立验收保存与身份校验。下载记录仍只在页面内存中保留，隔离版本则持久保存在本机后端。

## 运行与检查

在 `web/` 下执行，复用既有 Bun 依赖，不生成新锁文件：

```powershell
bun x vite --config experiments/psd-refine/vite.config.ts
bun test ./experiments/psd-refine
bun x tsc --project experiments/psd-refine/tsconfig.json --noEmit
bun x vite build --config experiments/psd-refine/vite.config.ts
```

缓存、构建与本次启动日志写入 Git 忽略的 `.local/cache/`。不启动后端，不读账号数据库。

## 审计：实际业务与可复用边界

| 能力 | 实际代码 | 发现与下一阶段边界 |
| --- | --- | --- |
| 主入口与导航 | `web/src/pages/ai-apps/index.tsx`、`nginx.conf`、`web/vite.config.ts` | 电商业务通过 `/motu` 进入独立 Next.js；不能假设主 web 内已有同名 React 页面 |
| 首页 / 快速开始 / 创建 | `apps/xc-aimutu/upstream/app/page.tsx`、`app/projects/new/page.tsx`、`app/hero-batch/page.tsx` | 本次不改入口与生成流程 |
| 商品工作台 | `app/projects/[id]/editor/page.tsx`、`components/editor/editor-workspace.tsx` | 已有三栏布局、刷新生成状态、模块保存、参考图、快捷键；未来在真实工作区切换编辑模式 |
| 模块、手机预览 | `components/editor/module-tree-panel.tsx`、`phone-preview-panel.tsx`、`editor-panel.tsx` | 预览关联当前图片；右侧包含 Prompt、参考图与版本操作，未来均须保留 |
| 临时状态 | `hooks/use-editor-store.ts` | 当前保存选中模块 ID；不需要重构该 store |
| 数据模型 | `prisma/schema.prisma` | `Project → PageSection → ProductAsset / SectionVersion`；任务通过 projectId / sectionId 关联 |
| 生成与版本 | `lib/services/generation-service.ts` | `listSectionVersions`、`activateSectionVersion` 可作为业务接入点；当前激活版本分步更新，PSD 双文件保存需要独立事务设计 |
| 版本 API | `app/api/projects/[id]/sections/[sectionId]/versions/route.ts`、`versions/[versionId]/activate/route.ts` | 已有版本读取/激活路径；不能直接假设已具备 PSD 所需的所有权、幂等与原子提交保证 |
| 文件上传 | `app/api/upload/route.ts`、`app/api/projects/[id]/assets/upload/route.ts` | 通用上传限制 50 MB；须在下一阶段逐路径审计格式、配额和权限，不能直接当成安全的 PSD 保存接口 |
| 本地素材与境彻资源 | `lib/storage/asset-manager.ts`、`lib/canvas/backend.ts`、`web/src/services/api/resources.ts` | 已有素材落盘、生成素材及后端资源桥接；Phase 1 优先扩展现有服务，不新建一套素材系统 |
| 导出 | `components/export/export-panel.tsx`、`project-export-button.tsx`、`lib/services/export-service.ts`、`app/projects/[id]/export/page.tsx` | 复用现有商品导出入口；当前不声称已支持 PSD |
| 历史与撤销 | `app/history/page.tsx`、`SectionVersion`、Photopea 原生历史面板 | 商品版本和编辑器内部撤销是两种不同能力；当前没有可直接复用的完整 PSD 恢复会话 |
| 身份与权限 | `middleware.ts`、`lib/services/project-service.ts`、`lib/canvas/backend.ts` | 集成模式通过后端 session 和 `x-canvas-user-id` 获取身份；`listProjects` 当前无用户过滤，版本列表按 sectionId 查询。接入前必须沿调用链补全对象归属验证，不能仅凭登录态认为安全 |
| UI 与主题 | `web/src/styles/globals.css`、`web/src/lib/app-theme.ts`、`docs/plans/ui-design-system.mdx` | 复用现有字体、token、AntD 主题和 AppModal；旧约定所指的 `docs/ui-design-system.md` 不存在，采用实际文档与代码 |
| 测试与开发 | `web/package.json`、`web/test/`、`docker-compose.dev.yml` | 主 web 用 Bun / Vite；电商是 Next.js / Prisma。此次不改 CI、Compose 或生产配置 |

上述 `app/`、`components/`、`lib/`、`prisma/` 路径如无前缀，均相对于 `apps/xc-aimutu/upstream/`。

### 源设计信息的真实性

`PageSection` 有 `copy`、`visualPrompt`、`editableData`；当前调用中见到参考素材 ID、主图比例、模板参考图和区域百分比。没有发现完整文字样式、逐元素坐标、图层层级和独立 Logo 的统一设计合同。

因此，AI PNG/JPG 作为单张位图导入。文案字段和 Prompt 不等于原图的可编辑文字图层；不做 OCR 伪还原。用户自己导入的 PSD 或在编辑器内新增的真实图层可参与后续往返验证。结构化转 PSD 继续留在 P1 数据审计之后。

### 后续最小集成设计（本次未实现）

1. 从选中模块取得真实 projectId、sectionId、currentImageAssetId 和源 SectionVersion，服务端验证用户归属。
2. 从有权限的资源服务取得二进制后传给编辑器，不把永久 token、Cookie 或带凭据 URL 放进 iframe 配置。
3. 导出 PSD 和预览图片，复用素材服务写入两个不可变素材；校验内容、大小、checksum、配额与持久化结果。
4. 评审 `SectionVersion` 的最小增量合同，表达 PSD 素材、预览素材、父版本、来源、幂等键。现有单一 imageAssetId 不能独自代表全部关系。模型未确认前不迁移。
5. 事务提交版本及当前预览指针，失败补偿新上传对象；两者全部成功后才显示项目保存成功。
6. 在原工作台和导出中心增量加入 PSD 入口；保留既有 Prompt、参考图及 AI 生成入口。

## 文件变更与冲突矩阵

Phase 0 新增以下文件；Phase 1 文件与变更另见 PHASE1.md：

- `index.html`：实验入口，不加入主站路由与 public。
- `vite.config.ts`、`tsconfig.json`：独立端口、构建和检查范围。
- `main.tsx`、`style.css`：编辑外壳、状态、关闭提示、文件记录。
- `sample.ts`：浏览器本地生成测试 PNG，不使用用户商品数据。
- `photopea-bridge.ts`：受控脚本、消息来源校验、串行操作和文件头检查。
- `photopea-bridge.test.ts`：协议与异常路径专项测试。
- `roundtrip-verification.ts`、`roundtrip-verification.test.ts`：十步受控样本往返、图片解码、报告及失败判定回归测试。
- `README.md`：审计、运行方法、证据与待验收事项。

| 范围 | 工作区已有改动 | 本次策略 |
| --- | --- | --- |
| 主 web 路由、全局 CSS、package / lock、Vite 配置 | 有 | 只读复用，不编辑 |
| 电商生成、导出、Prompt 与模板 | 有 | 不编辑，不切换引擎 |
| backend Prompt、资源、权限及服务 | 有 | 不编辑，不启动数据库 |
| `docs/content/docs/progress/pending-test.mdx` 等文档 | 有 | 不插入他人正在修改的文件，本阶段待验收项集中保留在本报告 |
| 本实验目录 | 本次新建 | 无已知文件冲突 |

## Photopea API 与边界

使用官方托管 iframe，URL hash 为 JSON 配置；`environment` 设置中文、主题、正常面板模式及历史/图层面板。通信仅接受 `https://www.photopea.com` 且 `event.source` 为当前 iframe 的消息。

- [Live Messaging](https://www.photopea.com/api/live)：ArrayBuffer 打开、字符串脚本、初始化和命令结束的 `done`、文件二进制返回。
- [Environment](https://www.photopea.com/api/environment)：主题、语言、视图与原生面板。
- [Scripts](https://www.photopea.com/learn/scripts)：`saveToOE`、`echoToOE` 和文档/图层模型。

状态为 initializing / ready / busy / exporting / error / disposed。本阶段没有上传和持久化，因此不虚构 saving 状态。

脚本只由代码内固定操作生成，没有用户或 AI 任意脚本入口。脚本回执带会话和命令标识；完成导出需要有效文件、匹配回执及结束事件。二进制导入的官方协议没有命令 ID，依赖串行；超时后整个适配器失效，阻止迟到响应串入下一命令。不自动重试写入。重连/关闭清理监听与计时器。

宿主不注册编辑快捷键、不读取跨域 DOM。关闭与页面退出采用保守提示：就绪后视为可能存在修改，不声称精确感知脏状态。下载记录不代表服务端保存。

未设置未经实测的 sandbox 或新增 CSP；iframe 权限、第三方请求、许可与品牌限制仍是后续发布前检查项。主产品原有 CSP 是否允许此嵌入必须在接入环境重新验证。

## 本次实际验证

| 检查 | 结果 | 证据边界 |
| --- | --- | --- |
| Bun 专项测试 | 12 通过 / 0 失败，52 次断言 | 使用模拟 Window、编辑器替身与协议样本，只证明通信状态机和验收失败判定，不证明真实文件可解析 |
| 独立 TypeScript 检查 | 通过 | 仅实验入口及其导入依赖，不代表全仓类型检查 |
| 独立 Vite 构建 | 通过 | 输出在忽略目录；沿用全局 CSS，存在既有 `/logo.svg` 引用提示及体积提示，尚未做接入后的拆包优化 |
| 本地入口 | HTTP 200，标题正确 | 只能证明 Vite 入口可用 |
| `/main.tsx` | HTTP 200，已转换模块 | 只能证明开发模块转换成功 |
| Photopea 初始化与 ready | 用户截图显示已加载、宿主显示已就绪 | 执行工具没有可连接浏览器，未完成自动端到端验证 |
| PNG / JPG / PSD 实际导入与导出 | 用户受控样本实测通过 | 用户截图显示十步通过和产物记录；未由工具直接读取报告或检查下载文件 |
| PSD 重新导入后文字可编辑 | 用户受控样本实测通过 | 截图显示修改写入文件检查通过、真实文字图层及最终验证文案；不代表任意复杂 PSD 兼容性 |
| 实际 UI 视觉、手机降级、键盘、全屏及重载 | 未验证 | 代码已有相应处理，未做浏览器验收 |
| 项目保存、版本激活、权限隔离 | 未接入 | 不属于本阶段实现 |

### 真实样本验收步骤

打开 3002，等待显示「编辑器已就绪」，展开左栏「Phase 0 往返验收」，点击「运行往返验证」。测试在真实 Photopea 中依次执行，发生错误即中止，不提前标记通过：

1. 在当前浏览器本地生成 900 × 1100 PNG，导入并核对尺寸。
2. 新增 `PHASE0_EDITABLE_TEXT` 文字图层，读取验证文字。
3. 导出初始分层 PSD 并校验文件头。
4. 重新导入 PSD，检查尺寸、顶层数量和文字保留。
5. 将该文字图层修改为 `PSD EDIT VERIFIED`，读取验证可编辑性。
6. 再次导出修改后的 PSD。
7. 重新导入修改后的 PSD，核对文字修改确实写入文件。
8. 导出 PNG，实际解码并核对尺寸。
9. 导出 JPG，实际解码、核对尺寸并重新导入。
10. 重新打开修改后的分层 PSD，核对最终文字。

下载记录提供源 PNG、初始 PSD、修改后 PSD、结果 PNG/JPG，以及本次 JSON 验收报告。失败时保留此前已产生的文件与失败报告；尚未执行的步骤不会被标为通过。

这是受控样本验收，不能替代用户实际复杂 PSD 的兼容性测试。随后应手工导入带图层组、蒙版、透明图层与文字的非敏感 PSD，修改文字、导出 PSD，再次打开检查；测试关闭提醒、网络阻断、重连、错误文件、重复操作、明暗主题与窄屏。

## 尚未解决与下一阶段门槛

- 用户已提供受控样本初始化、文件往返和文字可编辑的通过截图；仍需补齐布局修正后的视觉验收及其他未验证项，再认定整体 Phase 0 通过。
- Photopea 官方协议对二进制导入没有事务标识；重复原生操作、重载及网络延迟还需要真实环境验证。
- 本期只做文件头和大小初筛，不是完整格式解析或服务端恶意文件扫描。
- 浏览器中未下载的编辑内容不可恢复；下载后继续编辑也需要重新导出。无自动保存承诺。
- 复杂 PSD 的字体、色彩、智能对象和特效兼容性未经验证。
- 接入前必须完成用户资源归属、幂等保存、不可变版本、对象存储失败补偿和配额校验，并评审最小数据合同。
- 未合并 main，未部署生产。用户授权后已进入 Phase 1 的隔离保存验收；尚未进入 Phase 2 正式商品接入。
