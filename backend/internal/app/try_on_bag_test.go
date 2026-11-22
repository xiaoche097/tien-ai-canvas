package app

import "testing"

func TestTryOnBagAdmissionBindsCanonicalOperation(t *testing.T) {
	bag := map[string]any{"type": "backpack", "ageGroup": "adult", "views": []any{map[string]any{"source": "flat", "angle": "front"}, map[string]any{"source": "mannequin", "angle": "back"}}}
	input := map[string]any{"mode": "image", "referenceImages": []any{map[string]any{"storageKey": "resource:bag-front"}, map[string]any{"storageKey": "resource:bag-back"}, map[string]any{"storageKey": "resource:model"}}, "metadata": map[string]any{"tryOn": map[string]any{"tool": "bag", "productCount": 2, "referenceMode": "reference", "generationMode": "professional", "bag": bag}, "promptTemplateOperation": "untrusted", "promptTemplateVariables": map[string]any{"参考图分工": "untrusted"}}}
	if err := bindTryOnTaskInput(input, "canvas_image"); err != nil {
		t.Fatal(err)
	}
	metadata := input["metadata"].(map[string]any)
	if metadata["promptTemplateOperation"] != "try_on_bag" || metadata["promptTemplateVariables"] != nil {
		t.Fatal("bag task did not use server constraints")
	}
	input["referenceImages"] = []any{map[string]any{}, map[string]any{}}
	if bindTryOnTaskInput(input, "canvas_image") == nil {
		t.Fatal("accepted missing target model")
	}
}
