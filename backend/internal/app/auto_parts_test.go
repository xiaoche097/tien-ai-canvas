package app

import (
	"encoding/json"
	"testing"
)

func TestAutoPartsAdmissionProtectsOperationAndReferenceRoles(t *testing.T) {
	var input map[string]interface{}
	_ = json.Unmarshal([]byte(`{"mode":"image","config":{"count":"1"},"referenceImages":[{},{}],"metadata":{"aiApplicationId":"auto-parts-center","promptTemplateOperation":"untrusted","promptTemplateVariables":{"图片职责":"override"},"autoParts":{"vehicleId":"ford-f150","market":"US","year":"2026","configuration":"XLT","cabin":"SuperCrew · 全尺寸双排","seatingId":"crew-bench","driveSide":"left","productType":"seat-cover","productCount":1,"brand":"neutral","scene":"installation","description":"","confirmed":true}}}`), &input)
	if err := bindAutoPartsTaskInput(input, "canvas_image"); err != nil {
		t.Fatal(err)
	}
	metadata := input["metadata"].(map[string]interface{})
	if metadata["promptTemplateOperation"] != "auto_parts_scene" || metadata["promptTemplateVariables"] != nil {
		t.Fatal("client override survived admission")
	}
	if err := bindAutoPartsTaskInput(input, "canvas_text"); err == nil {
		t.Fatal("accepted text task")
	}
	metadata["autoParts"].(map[string]interface{})["unknown"] = true
	if err := bindAutoPartsTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("accepted unknown intent field")
	}
	delete(metadata["autoParts"].(map[string]interface{}), "unknown")
	input["config"].(map[string]interface{})["count"] = "4"
	if err := bindAutoPartsTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("accepted multiple output count")
	}
	input["config"].(map[string]interface{})["count"] = "1"
	input["config"].(map[string]interface{})["interfaceType"] = "runninghub-workflow-image"
	if err := bindAutoPartsTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("accepted workflow bypass of protected prompt compilation")
	}
	delete(input["config"].(map[string]interface{}), "interfaceType")
	metadata["tryOn"] = map[string]interface{}{}
	if err := bindAutoPartsTaskInput(input, "canvas_image"); err == nil {
		t.Fatal("accepted mixed try-on intent")
	}
}
