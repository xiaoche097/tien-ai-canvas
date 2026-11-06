package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestAstraviaToolFailureKeepsModelErrorsPublicAndInternalErrorsPrivate(t *testing.T) {
	for _, tc := range []struct {
		name    string
		err     error
		message string
		reason  string
	}{
		{"model capability", fmt.Errorf("admission: %w", service.ModelCapabilityNotSupported("安排工作需要文本模型，视频模型请写入 prompt")), "安排工作需要文本模型，视频模型请写入 prompt", "model_capability_not_supported"},
		{"invalid model", service.InvalidModelSelection("请选择可用的文本模型"), "请选择可用的文本模型", "invalid_model_selection"},
		{"internal", errors.New("private-diagnostic-do-not-expose"), internalErrorMessage, "internal"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			encoded, err := json.Marshal(astraviaToolFailure(nil, tc.err))
			if err != nil {
				t.Fatal(err)
			}
			var reply struct {
				IsError           bool
				Content           []struct{ Text string }
				StructuredContent struct {
					Reason    string
					Retryable bool
				}
			}
			if err = json.Unmarshal(encoded, &reply); err != nil {
				t.Fatal(err)
			}
			if !reply.IsError || len(reply.Content) != 1 || reply.Content[0].Text != tc.message || reply.StructuredContent.Reason != tc.reason || reply.StructuredContent.Retryable {
				t.Fatalf("incorrect public error projection: %s", encoded)
			}
			if strings.Contains(string(encoded), "private-diagnostic-do-not-expose") {
				t.Fatal("internal error leaked")
			}
		})
	}
}

func TestAstraviaMCPHTTPAuthorizationAndProtocol(t *testing.T) {
	router, db, cookie := profileHandlerFixture(t)
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	RegisterAstraviaRoutes(router.Group("/api"), svc)
	if err := db.Create(&model.CanvasProject{ID: "desktop-canvas", UserID: "profile-user", PayloadJSON: `{"nodes":[]}`}).Error; err != nil {
		t.Fatal(err)
	}
	grant := profileRequest(router, "POST", "/api/integrations/astravia", `{"canvasId":"desktop-canvas","apiBaseUrl":"http://127.0.0.1:3000/api"}`, cookie)
	if grant.Code != 200 {
		t.Fatalf("grant status %d", grant.Code)
	}
	if grant.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("grant response permits caching")
	}
	var envelope struct{ Data service.AstraviaConnection }
	if json.Unmarshal(grant.Body.Bytes(), &envelope) != nil || envelope.Data.Token == "" {
		t.Fatal("missing connection")
	}
	path := "/api/integrations/astravia/mcp/" + envelope.Data.ID
	call := func(method, body, token, origin, version string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		if version != "" {
			req.Header.Set("MCP-Protocol-Version", version)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	initialize := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}`
	for _, tc := range []struct {
		method, body, token, origin, version string
		status                               int
	}{
		{"POST", initialize, "", "", "", 401},
		{"POST", initialize, envelope.Data.Token, "https://evil.test", "", 403},
		{"POST", initialize, envelope.Data.Token, "", "bad-version", 400},
		{"GET", "", envelope.Data.Token, "", "", 405},
		{"POST", `{"jsonrpc":"2.0","method":"notifications/initialized"}`, envelope.Data.Token, "", "", 202},
		{"POST", initialize, envelope.Data.Token, "", "", 200},
	} {
		if rec := call(tc.method, tc.body, tc.token, tc.origin, tc.version); rec.Code != tc.status {
			t.Fatalf("protocol status: got %d, want %d", rec.Code, tc.status)
		}
	}
	result := call("POST", `{"jsonrpc":"2.0","id":"list","method":"tools/list"}`, envelope.Data.Token, "", "")
	var rpc struct {
		JSONRPC string `json:"jsonrpc"`
		Result  struct{ Tools []struct{ Name string } }
	}
	if json.Unmarshal(result.Body.Bytes(), &rpc) != nil || rpc.JSONRPC != "2.0" || len(rpc.Result.Tools) != 8 {
		t.Fatal("MCP tool catalogue invalid or enveloped")
	}
	revoked := profileRequest(router, "DELETE", "/api/integrations/astravia?canvasId=desktop-canvas", "", cookie)
	if revoked.Code != http.StatusOK {
		t.Fatalf("revoke status %d", revoked.Code)
	}
	if call("POST", initialize, envelope.Data.Token, "", "").Code != 401 {
		t.Fatal("revoked connection accepted")
	}
}
