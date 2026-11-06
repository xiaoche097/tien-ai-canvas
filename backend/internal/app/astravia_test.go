package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestAstraviaScopeRevocationAndExpiry(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	t.Setenv("ASTRAVIA_HOME", t.TempDir())
	for _, item := range []any{&model.CanvasProject{ID: "astravia-canvas", UserID: "user", PayloadJSON: `{"nodes":[]}`}, &model.CanvasProject{ID: "other-canvas", UserID: "user", PayloadJSON: `{"nodes":[]}`}} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
	token := strings.Repeat("a", 64)
	sum := sha256.Sum256([]byte(token))
	grant := astraviaGrant{UserID: "user", CanvasID: "astravia-canvas", TokenHash: hex.EncodeToString(sum[:]), ExpiresAt: time.Now().Add(time.Hour)}
	id := astraviaID(grant.UserID, grant.CanvasID)
	save := func() {
		value, _ := json.Marshal(grant)
		if err := s.repo.SaveSystemSetting(&model.SystemSetting{Key: "astravia:" + id, ValueJSON: string(value)}); err != nil {
			t.Fatal(err)
		}
	}
	save()
	if _, _, err := s.AstraviaAuthorize(id, strings.Repeat("b", 64)); err == nil {
		t.Fatal("wrong credential accepted")
	}
	user, canvas, err := s.AstraviaAuthorize(id, token)
	if err != nil || user != "user" || canvas != "astravia-canvas" {
		t.Fatal("valid grant refused")
	}
	value, err := s.AstraviaCall(context.Background(), user, canvas, "jingche_connection_status", json.RawMessage(`{}`))
	if err != nil || value.(map[string]any)["connected"] != true || value.(map[string]any)["canvasId"] != canvas {
		t.Fatal("connection status did not identify the authorized canvas")
	}
	if _, err := s.AstraviaCall(context.Background(), "other-user", canvas, "jingche_connection_status", json.RawMessage(`{}`)); err == nil {
		t.Fatal("connection status bypassed canvas ownership")
	}
	if err := s.DisconnectAstravia("other-user", canvas); err == nil {
		t.Fatal("other user revoked grant")
	}
	grant.ExpiresAt = time.Now().Add(-time.Second)
	save()
	if _, _, err := s.AstraviaAuthorize(id, token); err == nil {
		t.Fatal("expired grant accepted")
	}
	grant.ExpiresAt = time.Now().Add(time.Hour)
	save()
	if err := db.Model(&model.User{}).Where("id = ?", "user").Update("status", "disabled").Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.AstraviaAuthorize(id, token); err == nil {
		t.Fatal("disabled user accepted")
	}
	if err := s.DisconnectAstravia("user", canvas); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.AstraviaAuthorize(id, token); err == nil {
		t.Fatal("revoked grant accepted")
	}
}

func TestAstraviaDelegationForcesApprovalAndCanvasScope(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	for _, id := range []string{"agent-canvas", "other-canvas"} {
		if err := db.Create(&model.CanvasProject{ID: id, UserID: "user", PayloadJSON: `{"nodes":[]}`}).Error; err != nil {
			t.Fatal(err)
		}
	}
	input := agentTestRequest()
	input.PermissionMode = "auto"
	raw, _ := json.Marshal(input)
	value, err := s.AstraviaCall(context.Background(), "user", "agent-canvas", "jingche_submit_job", raw)
	if err != nil {
		t.Fatal(err)
	}
	run := value.(*CloudAgentRun)
	if run.PermissionMode != "request_approval" {
		t.Fatal("external delegation bypassed approval")
	}
	again, err := s.AstraviaCall(context.Background(), "user", "agent-canvas", "jingche_submit_job", raw)
	if err != nil || again.(*CloudAgentRun).ID != run.ID {
		t.Fatal("retry created duplicate work")
	}
	jobArgs, _ := json.Marshal(map[string]string{"runId": run.ID})
	for _, tool := range []string{"jingche_get_job", "jingche_cancel_job", "jingche_decide_approval"} {
		if _, err := s.AstraviaCall(context.Background(), "user", "other-canvas", tool, jobArgs); err == nil {
			t.Fatal("cross-canvas job access accepted")
		}
	}
	input.CanvasID = "other-canvas"
	raw, _ = json.Marshal(input)
	if _, err := s.AstraviaCall(context.Background(), "user", "agent-canvas", "jingche_submit_job", raw); err == nil {
		t.Fatal("cross-canvas submission accepted")
	}
}

func TestAstraviaSubmittedSkillsAreValidated(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	if err := db.Create(&model.CanvasProject{ID: "agent-canvas", UserID: "user", PayloadJSON: `{"nodes":[]}`}).Error; err != nil {
		t.Fatal(err)
	}
	request, _ := json.Marshal(agentTestRequest())
	var input map[string]any
	if err := json.Unmarshal(request, &input); err != nil {
		t.Fatal(err)
	}
	input["skillIds"] = []string{"not-installed-for-this-user"}
	raw, _ := json.Marshal(input)
	if _, err := s.AstraviaCall(context.Background(), "user", "agent-canvas", "jingche_submit_job", raw); err == nil || !strings.Contains(err.Error(), "技能") {
		t.Fatal("submitted skillIds were ignored or admitted without validation")
	}
}

func TestAstraviaJobCanApproveAndWriteAuthorizedCanvas(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	canvas := model.CanvasProject{ID: "agent-canvas", UserID: "user", PayloadJSON: `{"nodes":[]}`}
	if err := db.Create(&canvas).Error; err != nil {
		t.Fatal(err)
	}
	req := agentTestRequest()
	req.IdempotencyKey = "astravia-canvas-control-test"
	request, _ := json.Marshal(req)
	var input map[string]any
	if err := json.Unmarshal(request, &input); err != nil {
		t.Fatal(err)
	}
	delete(input, "model") // Match the public MCP schema: a text channel pair is sufficient.
	request, _ = json.Marshal(input)
	value, err := s.AstraviaCall(context.Background(), "user", canvas.ID, "jingche_submit_job", request)
	if err != nil {
		t.Fatal(err)
	}
	run := value.(*CloudAgentRun)
	doc, _ := creationDocument(canvas.PayloadJSON)
	operations, _ := json.Marshal(map[string]any{"snapshotHash": cloudAgentCanvasHash(doc), "ops": []map[string]any{{"type": "add_node", "id": "astravia-note", "nodeType": "text", "title": "Astravia note", "content": "Astravia approved canvas write", "x": 24, "y": 48}}})
	// Substitute only the model response; admission, approvals and canvas writes use the real service.
	response, _ := json.Marshal(map[string]any{"toolCalls": []map[string]any{
		{"id": "read-1", "type": "function", "function": map[string]any{"name": "canvas_get_state", "arguments": "{}"}},
		{"id": "write-1", "type": "function", "function": map[string]any{"name": "canvas_apply_ops", "arguments": string(operations)}},
	}})
	if err = db.Model(&model.Task{}).Where("id = ?", run.ID).Updates(map[string]any{"status": model.TaskStatusSucceeded, "result_json": string(response)}).Error; err != nil {
		t.Fatal(err)
	}
	for step := 0; step < 3; step++ {
		if err = s.advanceCloudAgentByID("user", run.ID); err != nil {
			t.Fatal(err)
		}
	}
	jobArgs, _ := json.Marshal(map[string]string{"runId": run.ID})
	value, err = s.AstraviaCall(context.Background(), "user", canvas.ID, "jingche_get_job", jobArgs)
	if err != nil {
		t.Fatal(err)
	}
	waiting := value.(*CloudAgentRun)
	if waiting.Status != "waiting_approval" || waiting.Approval == nil {
		t.Fatal("MCP write did not wait for approval")
	}
	stored, err := s.repo.CanvasProjectForUser("user", canvas.ID)
	if err != nil || strings.Contains(stored.PayloadJSON, "astravia-note") {
		t.Fatal("canvas changed before approval")
	}
	approval, _ := json.Marshal(map[string]string{"runId": run.ID, "approvalId": waiting.Approval.ID, "decision": "approve", "reason": "isolated test approval"})
	if _, err = s.AstraviaCall(context.Background(), "user", canvas.ID, "jingche_decide_approval", approval); err != nil {
		t.Fatal(err)
	}
	if err = s.advanceCloudAgentByID("user", run.ID); err != nil {
		t.Fatal(err)
	}
	value, err = s.AstraviaCall(context.Background(), "user", canvas.ID, "jingche_get_canvas", json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	result, _ := json.Marshal(value)
	if !strings.Contains(string(result), "Astravia approved canvas write") {
		t.Fatal("approved MCP job did not write the canvas")
	}
}
