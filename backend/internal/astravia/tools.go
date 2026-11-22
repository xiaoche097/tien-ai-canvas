package astravia

func Tools() []map[string]any {
	str := func(description string) map[string]any {
		return map[string]any{"type": "string", "description": description}
	}
	tool := func(name, description string, properties map[string]any, required []string, read bool) map[string]any {
		return map[string]any{"name": name, "description": description, "inputSchema": map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}, "annotations": map[string]any{"readOnlyHint": read, "destructiveHint": !read, "openWorldHint": !read}}
	}
	empty := func() map[string]any { return map[string]any{} }
	return []map[string]any{
		tool("jingche_connection_status", "检查 Astravia 是否已连接境彻，返回当前授权画布名称、ID 和可用能力。用户询问连接状态或安排境彻工作时，先调用此工具确认。调用成功才表示可访问；失败不能声称已连接。", empty(), []string{}, true),
		tool("jingche_get_canvas", "读取已授权的境彻画布。连接只允许访问这个画布；用它核对节点和最终图片、视频结果。", empty(), []string{}, true),
		tool("jingche_list_models", "查询境彻受管模型、能力和价格。agentTextModels 专门列出可执行安排工作的文本模型；submit_job 的模型字段只能从这里选择。图片/视频模型（例如 MiniMax 视频）只写入 prompt，由境彻执行器调用，不能填入 submit_job 的文本模型字段。不接收 Astravia 的模型密钥。", empty(), []string{}, true),
		tool("jingche_list_skills", "列出当前用户已添加的境彻技能；skillId 可用于 submit_job。Astravia 自己的 Agent/Skills 仍在 Astravia 使用，不会自动同步。", empty(), []string{}, true),
		tool("jingche_submit_job", "把图片、视频、分镜工作交给境彻 Agent，在授权画布内创建节点并执行生成，按境彻正常计费。先选择受管文本模型并明确积分预算。保存 idempotencyKey；超时重试必须用相同参数与相同 key。返回 queued/running 不代表生成成功，之后查询 get_job。需要审批时展示 approval 内容并获得用户明确同意。", map[string]any{
			"prompt":          str("工作安排；明确图片/视频的模型、数量、时长、比例和参考节点"),
			"logicalModelId":  str("agentTextModels.logicalModels 中的文本模型 id，必须使用 id 而非 code/name；填写时省略 channelId 和 channelModelKey"),
			"channelId":       str("agentTextModels.channelModels 中的文本渠道 ID，与 channelModelKey 配对；不能填写视频或图片渠道"),
			"channelModelKey": str("与 channelId 配对的文本模型标识，必须来自 agentTextModels.channelModels；视频模型要求写在 prompt 中"),
			"idempotencyKey":  str("每项工作唯一的 8–128 字符标识；同一工作重试保持不变"),
			"parentRunId":     str("续接同一画布中已结束的上一轮工作 ID"),
			"skillIds":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"budget":          map[string]any{"type": "object", "properties": map[string]any{"maxCredits": map[string]any{"type": "number", "exclusiveMinimum": 0}, "maxGenerationTasks": map[string]any{"type": "integer", "minimum": 0}, "maxVideoSeconds": map[string]any{"type": "integer", "minimum": 0}}, "required": []string{"maxCredits"}, "additionalProperties": false},
		}, []string{"prompt", "idempotencyKey", "budget"}, false),
		tool("jingche_get_job", "查询工作进度、日志、审批和结果。等待期间隔几秒查询；completed 后再读画布核对媒体是否已完成。", map[string]any{"runId": str("境彻工作 ID")}, []string{"runId"}, true),
		tool("jingche_cancel_job", "取消授权画布内的工作；已完成生成的费用不会因取消而退回。", map[string]any{"runId": str("工作 ID")}, []string{"runId"}, false),
		tool("jingche_decide_approval", "仅在用户明确同意或拒绝后处理 get_job 返回的待审批操作；先展示操作内容、模型和费用。不能自行批准。Astravia 保留本工具的调用确认。", map[string]any{"runId": str("工作 ID"), "approvalId": str("当前待审批 ID"), "decision": map[string]any{"type": "string", "enum": []string{"approve", "reject"}}, "reason": str("用户确认或拒绝的原因")}, []string{"runId", "approvalId", "decision"}, false),
	}
}
