package tools

import (
	"encoding/json"
	"sync"
)

// BuiltinImagePreset shares the existing seed content with prompt version management.
type BuiltinImagePreset struct {
	ID     int64
	Key    string
	Label  string
	Desc   string
	Prompt string
	Ratio  string
}

var loadBuiltinImagePresets = sync.OnceValues(func() ([]BuiltinImagePreset, error) {
	var file builtinToolsFile
	if err := json.Unmarshal(builtinToolsJSON, &file); err != nil {
		return nil, err
	}
	presets := make([]BuiltinImagePreset, 0, len(file.NineGrid.List))
	for _, item := range file.NineGrid.List {
		presets = append(presets, BuiltinImagePreset{ID: item.ID, Key: item.LabelEn, Label: item.Label, Desc: item.Desc, Prompt: item.Prompt, Ratio: item.Ratio})
	}
	return presets, nil
})

func BuiltinImagePresets() ([]BuiltinImagePreset, error) {
	presets, err := loadBuiltinImagePresets()
	return append([]BuiltinImagePreset(nil), presets...), err
}
