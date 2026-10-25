package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"

	"yingce/backend/internal/prompts"
)

func tryOnIntent(input canvasGenerationInput) (*prompts.TryOnIntent, error) {
	value, exists := input.Metadata["tryOn"]
	if !exists {
		return nil, BadAuthRequest("换装任务缺少结构化参数，请刷新页面后重新提交")
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, BadAuthRequest("换装参数格式无效")
	}
	var intent prompts.TryOnIntent
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&intent); err != nil {
		return nil, BadAuthRequest("换装参数格式无效")
	}
	if input.Mode != "image" {
		return nil, BadAuthRequest("换装能力只能用于图片任务")
	}
	if err := intent.Validate(len(input.ReferenceImages)); err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	return &intent, nil
}

func isTryOnInput(input canvasGenerationInput) bool {
	_, exists := input.Metadata["tryOn"]
	return exists || metadataString(input.Metadata, "aiApplicationId") == "universal-try-on" || strings.HasPrefix(metadataString(input.Metadata, "promptTemplateOperation"), "try_on_") && metadataString(input.Metadata, "promptTemplateOperation") != prompts.TryOnDescriptionOperation
}

// 绑定在计费 admission 之前执行；模板、图片职责与真实输入匹配，不接受客户端自定义能力名称。
func bindTryOnTaskInput(raw map[string]interface{}, taskType string) error {
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	var input canvasGenerationInput
	if err := json.Unmarshal(data, &input); err != nil {
		return err
	}
	if metadataString(input.Metadata, "aiApplicationId") == "universal-try-on-prompt" || metadataString(input.Metadata, "promptTemplateOperation") == prompts.TryOnDescriptionOperation {
		idea, ok := input.Metadata["tryOnDescription"].(string)
		boundary, validTool := prompts.TryOnDescriptionBoundary(metadataString(input.Metadata, "tryOnTool"))
		if !ok || !validTool || strings.TrimSpace(idea) == "" || utf8.RuneCountInString(idea) > 2000 || input.Mode != "text" || taskType != "canvas_text" {
			return BadAuthRequest("描述扩写需要 1～2000 字的摄影想法及文本任务")
		}
		input.Metadata["promptTemplateOperation"] = prompts.TryOnDescriptionOperation
		encoded, _ := json.Marshal(idea)
		input.Metadata["promptTemplateVariables"] = map[string]string{"用户想法": string(encoded), "任务边界": boundary}
		raw["metadata"] = input.Metadata
		return nil
	}
	if !isTryOnInput(input) {
		return nil
	}
	if taskType != "canvas_image" {
		return BadAuthRequest("换装能力只能用于图片任务")
	}
	intent, err := tryOnIntent(input)
	if err != nil {
		return err
	}
	op, _ := prompts.TryOnOperation(intent.Tool)
	input.Metadata["aiApplicationId"] = "universal-try-on"
	input.Metadata["promptTemplateOperation"] = op
	delete(input.Metadata, "promptTemplateVariables")
	raw["metadata"] = input.Metadata
	return nil
}

func tryOnAdapterOperation(config providerConfig) string {
	name := strings.ToLower(strings.TrimSpace(config.Model))
	if config.ProviderModelKey != "" {
		name = strings.ToLower(config.ProviderModelKey)
	}
	if strings.Contains(name, "gemini") || strings.HasPrefix(name, "nano-banana") || config.InterfaceType == "gemini-image" {
		return "try_on_adapter_gemini"
	}
	if strings.Contains(name, "gpt-image") || strings.HasPrefix(name, "chatgpt-image") {
		return "try_on_adapter_gpt"
	}
	return ""
}

func (s *Service) compileTryOnPrompt(userID string, input canvasGenerationInput) (string, error) {
	intent, err := tryOnIntent(input)
	if err != nil {
		return "", err
	}
	op, _ := prompts.TryOnOperation(intent.Tool)
	compiled, err := s.compilePrompt(userID, op, intent.Values())
	if err != nil {
		return "", fmt.Errorf("编译换装能力失败：%w", err)
	}
	if adapterOperation := tryOnAdapterOperation(input.Config); adapterOperation != "" {
		adapter, err := s.compilePrompt(userID, adapterOperation, nil)
		if err != nil {
			return "", fmt.Errorf("编译图像模型适配失败：%w", err)
		}
		compiled.Content += "\n\n" + adapter.Content
	}
	return compiled.Content, nil
}
