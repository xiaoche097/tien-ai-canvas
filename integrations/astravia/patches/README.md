# Astravia MCP 可选字段修复

## 适用问题

Astravia 0.5.86 的 `convertMcpJsonSchemaToTypeBox` 先调用 `Type.Object(properties)`，
再为可选属性添加 `Type.Optional`。TypeBox 构造对象时已经计算 `required`，之后给属性
添加标记不会更新该数组。因此服务端正确声明的可选参数在 Astravia 本地变成必填。

境彻 `jingche_submit_job` 必填项为 `prompt`、`idempotencyKey` 和 `budget`；
渠道文本执行器省略 `logicalModelId`，新任务省略 `parentRunId`。不能伪造模型或父轮 ID
来满足错误的本地校验，也不能通过提高积分预算解决这个问题。

## 修复与边界

源代码补丁见 `0.5.86-mcp-optional.patch`。先给属性添加可选标记，再构造对象。
这也修复嵌套预算可选字段和审批可选原因被错误声明为必填的问题。
模型选择、预算和授权的服务端业务校验保持原样。

本仓库提供 `scripts/repair-astravia-mcp-schema.cjs` 用于已安装版本的可回退修复：

```powershell
node --experimental-vm-modules scripts/repair-astravia-mcp-schema.cjs --bundle '<已安装版本>/resources/coding-agent/dist/agent-rpc-cli.mjs'
# 先完成专项验证，再执行：
node --experimental-vm-modules scripts/repair-astravia-mcp-schema.cjs --bundle '<已安装版本>/resources/coding-agent/dist/agent-rpc-cli.mjs' --apply
```

脚本只接受已识别的函数边界及唯一匹配代码；先解析完整候选程序，再备份原文件、
校验 SHA-256 并替换。重复运行不重复修改，未知版本会拒绝执行。
备份保存在原文件旁，名称包含原始内容摘要。此操作不更改连接配置、凭据或境彻数据。
运行中的进程不会自动加载新文件，应保存工作后退出并重新打开 Astravia，再加载连接。
Astravia 后续应用更新可能覆盖本地补丁，需要重新检查新版本；不得盲目跨版本应用。

## 本次验证

- 使用 3000 实际 `tools/list` 返回的 Schema 复现错误，并断言服务端必填列表正确。
- 使用与已安装包相同的 TypeBox 0.34.52，对实际程序中的转换函数完成修复前后验证。
- 渠道文本执行器新任务省略逻辑模型及父轮可通过；必填缺失、错误类型及非法审批枚举仍被拒绝。
- 嵌套预算仅要求 `maxCredits`；序列化后 `required` 与 MCP 原声明一致。
- 已安装修复后的函数及完整程序语法检查通过，原授权的 8 项目录、4 项读取正常。
- 未提交真实任务、调用收费生成、调整预算或重建 3000 容器。

真实 Astravia 会话重新加载后的完整生成仍待用户验收。
