package app

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTryOnAdmissionBindsCanonicalOperationAndChecksActualReferences(t *testing.T) {
	input := map[string]any{"mode": "image", "referenceImages": []any{map[string]any{"storageKey": "resource:test"}}, "metadata": map[string]any{"aiApplicationId": "universal-try-on", "promptTemplateOperation": "try_on_color", "promptTemplateVariables": map[string]any{"参考图分工": "伪造职责"}, "tryOn": map[string]any{"tool": "outfit", "productCount": 1, "referenceMode": "smart", "generationMode": "professional", "hasAnchor": false, "description": ""}}}
	if err := bindTryOnTaskInput(input, "canvas_image"); err != nil {
		t.Fatal(err)
	}
	metadata := input["metadata"].(map[string]any)
	if metadata["promptTemplateOperation"] != "try_on_outfit" || metadata["promptTemplateVariables"] != nil {
		t.Fatal("client template overrides survived admission")
	}
	input["referenceImages"] = []any{}
	if err := bindTryOnTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("accepted missing image")
	}
}

func TestTryOnRejectsMissingIntentWrongModeAndUnknownFields(t *testing.T) {
	for _, raw := range []string{
		`{"mode":"image","metadata":{"aiApplicationId":"universal-try-on"}}`,
		`{"mode":"text","referenceImages":[{}],"metadata":{"tryOn":{"tool":"outfit","productCount":1,"referenceMode":"smart","generationMode":"professional"}}}`,
		`{"mode":"image","referenceImages":[{}],"metadata":{"tryOn":{"tool":"outfit","productCount":1,"referenceMode":"smart","generationMode":"professional","override":"custom prompt"}}}`,
	} {
		var input map[string]any
		_ = json.Unmarshal([]byte(raw), &input)
		if err := bindTryOnTaskInput(input, "canvas_image"); err == nil {
			t.Fatal("accepted invalid task")
		}
	}
}

func TestTryOnAdapterUsesResolvedModelAndProtocolNotDisplayLabels(t *testing.T) {
	for _, test := range []struct {
		config providerConfig
		want   string
	}{
		{providerConfig{Model: "gpt-image-2", APIFormat: "openai"}, "try_on_adapter_gpt"},
		{providerConfig{Model: "gemini-3.1-flash-image"}, "try_on_adapter_gemini"},
		{providerConfig{Model: "custom-alias", InterfaceType: "gemini-image"}, "try_on_adapter_gemini"},
		{providerConfig{Model: "front-alias", ProviderModelKey: "gpt-image-2"}, "try_on_adapter_gpt"},
		{providerConfig{Model: "qwen-image", APIFormat: "openai"}, ""},
	} {
		if got := tryOnAdapterOperation(test.config); got != test.want {
			t.Fatalf("adapter = %s, want %s", got, test.want)
		}
	}
}

func TestTryOnDescriptionIsBackendTemplateData(t *testing.T) {
	input := map[string]any{"mode": "text", "metadata": map[string]any{"aiApplicationId": "universal-try-on-prompt", "tryOnTool": "pose", "tryOnDescription": "自然站立"}}
	if err := bindTryOnTaskInput(input, "canvas_text"); err != nil {
		t.Fatal(err)
	}
	meta := input["metadata"].(map[string]any)
	if meta["promptTemplateOperation"] != "try_on_description" {
		t.Fatal("description not template-backed")
	}
	if !strings.Contains(meta["promptTemplateVariables"].(map[string]string)["任务边界"], "模特换姿势") {
		t.Fatal("description lost tool boundary")
	}
	meta["tryOnTool"] = "unknown"
	if err := bindTryOnTaskInput(input, "canvas_text"); err == nil {
		t.Fatal("accepted unknown description tool")
	}
	meta["tryOnTool"] = "pose"
	if err := bindTryOnTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("text expansion accepted image task")
	}
}

func TestTryOnShoeViewsAdmission(t *testing.T) {
	var input map[string]any
	_ = json.Unmarshal([]byte(`{"mode":"image","referenceImages":[{},{},{}],"metadata":{"tryOn":{"tool":"shoes","productCount":3,"referenceMode":"smart","generationMode":"professional","shoeViews":["pair","outer","inner"]}}}`), &input)
	if err := bindTryOnTaskInput(input, "canvas_image"); err != nil {
		t.Fatal(err)
	}
	if input["metadata"].(map[string]any)["promptTemplateOperation"] != "try_on_shoes" {
		t.Fatal("shoe role not bound")
	}
	input["referenceImages"] = []any{map[string]any{}, map[string]any{}}
	if err := bindTryOnTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("accepted incomplete multi-view task")
	}
}

func TestTryOnFlatGarmentSlotsAdmission(t *testing.T) {
	for _, slots := range [][]string{{"upper", "lower"}, {"lower"}, {"full"}} {
		references := make([]any, len(slots))
		for index := range references {
			references[index] = map[string]any{"storageKey": "resource:fixture"}
		}
		input := map[string]any{"mode": "image", "referenceImages": references, "metadata": map[string]any{"tryOn": map[string]any{"tool": "flat", "productCount": len(slots), "referenceMode": "smart", "generationMode": "children", "garmentSlots": slots}}}
		if err := bindTryOnTaskInput(input, "canvas_image"); err != nil {
			t.Fatal(err)
		}
		metadata := input["metadata"].(map[string]any)
		if metadata["promptTemplateOperation"] != "try_on_flat" {
			t.Fatal("flat slots not bound to the flat template")
		}
		metadata["tryOn"].(map[string]any)["garmentSlots"] = []string{"full", "upper"}
		if err := bindTryOnTaskInput(input, "canvas_image"); err == nil {
			t.Fatal("accepted mixed full-body and separate garment slots")
		}
	}
}

func TestTryOnAccessoryCategoryAdmission(t *testing.T) {
	for _, category := range []string{"bag", "belt", "necklace", "glasses", "bracelet", "hat", "ring"} {
		input := map[string]any{"mode": "image", "referenceImages": []any{map[string]any{"storageKey": "resource:fixture"}}, "metadata": map[string]any{"tryOn": map[string]any{"tool": "accessory", "productCount": 1, "referenceMode": "smart", "generationMode": "professional", "accessoryType": category}}}
		if err := bindTryOnTaskInput(input, "canvas_image"); err != nil {
			t.Fatal(err)
		}
		metadata := input["metadata"].(map[string]any)
		if metadata["promptTemplateOperation"] != "try_on_accessory" {
			t.Fatal("accessory category lost its canonical operation")
		}
		metadata["tryOn"].(map[string]any)["accessoryType"] = "unknown"
		if err := bindTryOnTaskInput(input, "canvas_image"); err == nil {
			t.Fatal("accepted unknown accessory category")
		}
	}
}
