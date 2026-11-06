export const canvasWorkflow = `境彻画布工作调用约定（以本轮工具实际响应为准）：
1. 境彻已把工作提交接入画布内置 Agent。先调用 jingche_connection_status、jingche_get_canvas 和 jingche_list_models，确认授权画布、参考节点和实时模型清单。
2. jingche_submit_job 的 channelId/channelModelKey 是负责理解指令和操作画布的【文本执行器】，不是最终图片或视频模型。只从本轮 jingche_list_models.agentTextModels.channelModels 复制同一条文本模型的 channelId 与 channelModelKey。优先沿用用户选过的文本执行器；用户只指定视频/图片模型时，保留其生成要求，按已确认预算从实际文本清单选择执行器并说明两者用途。
3. 使用渠道文本执行器时完全省略 logicalModelId。仅当 agentTextModels.logicalModels 非空且含可用文本模型时才可使用其中真实 id，不能把 code、name、渠道名或 deepseek-flash、magpie 这些显示名称当成逻辑模型 id。列表为空就不要尝试逻辑路由。
4. 用户要的 MiniMax/万有引力等视频渠道、模型、15 秒时长、三张参考图节点和画面要求应完整写在 prompt 中，由境彻内置 Agent 调用相应生成工具。不得把 capability=video/image 的模型塞进文本执行器字段。
5. 使用用户明确确认的积分和生成预算、真实已添加的 skillId；新工作省略 parentRunId，只有工具已返回的真实上一轮 runId 才能作为父轮。保存 idempotencyKey；超时或结果不明确时保留同一参数和同一 key，避免重复生成。
6. 拿到 runId 后用 jingche_get_job 查询，等待审批时先展示操作、模型和费用，获得用户明确同意后才调用 jingche_decide_approval。工作完成后重新读取画布，核对节点和媒体结果，不把 queued/running 说成生成成功。
7. 模型能力不匹配、模型不可用、字段互斥是参数错误，不等于连接故障或服务端修改规则。核对实时文本清单后纠正对应字段；禁止轮流猜视频渠道、逻辑名称和技能进行无依据重试。没有实际成功调用和结果证据时，不得声称已操控或已生成。`;
