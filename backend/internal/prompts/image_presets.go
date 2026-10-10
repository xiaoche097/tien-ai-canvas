package prompts

import (
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/tools"
)

const canvasImagePresetPrefix = "canvas_image_preset_"

func imagePresetPromptDefinitions() []PromptOperationDefinition {
	presets, err := tools.BuiltinImagePresets()
	if err != nil {
		// A malformed embedded seed is a build defect, never an empty runtime catalog.
		panic(err)
	}
	definitions := make([]PromptOperationDefinition, 0, len(presets))
	for _, preset := range presets {
		definitions = append(definitions, PromptOperationDefinition{
			Operation: canvasImagePresetPrefix + preset.Key,
			Label:     "画布 · " + preset.Label, Category: "画布图片预设", OutputType: "text",
			Description: preset.Desc + "。用于图片节点顶部预设；参考图、比例和布局参数由原生成流程处理。",
			Variables:   []PromptTemplateVariable{}, DefaultContent: preset.Prompt,
		})
	}
	return definitions
}

// CanvasImagePresetOperation only binds canonical builtin tools, never user tools.
func CanvasImagePresetOperation(tool *model.Tool) (string, bool) {
	if tool == nil || tool.Source != tools.ToolSourceBuiltin || tool.Type != tools.ToolTypeNineGrid {
		return "", false
	}
	presets, err := tools.BuiltinImagePresets()
	if err != nil {
		panic(err)
	}
	for _, preset := range presets {
		if tool.ID == preset.ID && tool.LabelEn == preset.Key {
			return canvasImagePresetPrefix + preset.Key, true
		}
	}
	return "", false
}
