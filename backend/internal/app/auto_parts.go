package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"yingce/backend/internal/prompts"
)

func (s *Service) AutoPartsVehicles() []prompts.AutoPartsVehicle { return prompts.AutoPartsVehicles() }

func isAutoPartsInput(input canvasGenerationInput) bool {
	_, exists := input.Metadata["autoParts"]
	return exists || metadataString(input.Metadata, "aiApplicationId") == "auto-parts-center" || metadataString(input.Metadata, "promptTemplateOperation") == prompts.AutoPartsOperation
}

func autoPartsIntent(input canvasGenerationInput) (*prompts.AutoPartsIntent, error) {
	if input.Mode != "image" || input.Config.Count != "1" || isTryOnInput(input) {
		return nil, BadAuthRequest("汽配效果图只能使用独立单张图片任务")
	}
	raw, err := json.Marshal(input.Metadata["autoParts"])
	if err != nil {
		return nil, BadAuthRequest("汽配参数格式无效")
	}
	var intent *prompts.AutoPartsIntent
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&intent) != nil || intent == nil {
		return nil, BadAuthRequest("汽配任务缺少有效参数")
	}
	if err := intent.Validate(len(input.ReferenceImages)); err != nil {
		return nil, BadAuthRequest(err.Error())
	}
	return intent, nil
}

func bindAutoPartsTaskInput(raw map[string]interface{}, taskType string) error {
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	var input canvasGenerationInput
	if err := json.Unmarshal(data, &input); err != nil {
		return err
	}
	if !isAutoPartsInput(input) {
		return nil
	}
	if taskType != "canvas_image" || taskInputUsesWorkflowProvider(raw) {
		return BadAuthRequest("汽配效果图只能提交普通模型图片任务")
	}
	if _, err := autoPartsIntent(input); err != nil {
		return err
	}
	input.Metadata["aiApplicationId"] = "auto-parts-center"
	input.Metadata["promptTemplateOperation"] = prompts.AutoPartsOperation
	delete(input.Metadata, "promptTemplateVariables")
	raw["metadata"] = input.Metadata
	return nil
}

func (s *Service) compileAutoPartsPrompt(userID string, input canvasGenerationInput) (string, error) {
	intent, err := autoPartsIntent(input)
	if err != nil {
		return "", err
	}
	compiled, err := s.compilePrompt(userID, prompts.AutoPartsOperation, intent.Values())
	if err != nil {
		return "", fmt.Errorf("编译汽配效果图能力失败：%w", err)
	}
	return compiled.Content, nil
}
