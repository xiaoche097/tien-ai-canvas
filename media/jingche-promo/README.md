# 境彻 · 30 秒工作流介绍

规格：1920 × 1080，30 fps，30 秒，H.264 MP4，原创电子配乐，无口播。

## 分镜

| 时间 | 内容 | 画面 |
| --- | --- | --- |
| 0–3.5 秒 | 品牌开场：让灵感，开始成片 | Logo 汇聚、透视光环、粒子与网格 |
| 3.5–9 秒 | 一句想法，开启创作 | 真实创作页录屏、填写需求、切换视频模式 |
| 9–15 秒 | 把故事，连接成工作流 | 真实短剧画布录屏、画风筛选与故事节点 |
| 15–21 秒 | 先掌控镜头，再生成画面 | 真实 3D 预演台截图、焦距与动画时间轴聚焦 |
| 21–26.5 秒 | 从故事，到作品 | 剧本 → 角色/场景 → 分镜 → 多媒体 → 剪辑的动态图解 |
| 26.5–30 秒 | 品牌收束 | 境彻：你的想象，自有全境 |

## 事实与素材边界

- 功能依据当前仓库介绍、功能文档与本机真实界面。未把尚未生成的输出包装成已生成作品。
- 创作与工作流段为本机实际浏览器操作，剪掉等待并加速；导演台段为真实截图动态合成。浏览器录屏未收进 3D 浮层，因此没有将画布录屏冒充导演台录屏。
- 最后的全流程图是能力说明动画，不代表一次实际全链路生成验收。
- 本次没有提交收费模型生成。新建了一张演示画布，写入故事与画风，并添加双人预演镜头，未修改原有画布内容。
- 配乐由 scripts/score.py 本地合成，无第三方音乐素材。
- 真实界面素材保存在 public；原始录屏保留用于复剪。成片画面不包含登录凭据。

## 修改与重渲染

在本目录执行：

```powershell
bun install --frozen-lockfile
python scripts/score.py
bun run studio
bun run render
```

Windows 可额外传入已安装 Chrome：

```powershell
bunx remotion render src/index.tsx JingcheWorkflow out/jingche-workflow-30s.mp4 --codec h264 --crf 18 --browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"
```

主合成在 src/index.tsx；全部动画由帧驱动，可在 Remotion 中调整时间、文案、颜色和镜头。
