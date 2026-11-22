package protocol

import (
	"context"
	"encoding/json"
	"testing"
)

func TestOfficialTextProtocolsMapImages(t *testing.T) {
	const image = "data:image/png;base64,aGVsbG8="
	tests := []struct {
		name, provider, field, want string
	}{
		{"google-gemini-generate-content", "gemini-generate-content", "contents", `[{"role":"user","parts":[{"text":"inspect"},{"inlineData":{"mimeType":"image/png","data":"aGVsbG8="}}]}]`},
		{"anthropic-messages", "claude-api", "messages", `[{"role":"user","content":[{"type":"text","text":"inspect"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"aGVsbG8="}}]}]`},
		{"openai-responses", "openai-response", "input", `[{"role":"user","content":[{"type":"input_text","text":"inspect"},{"type":"input_image","image_url":"data:image/png;base64,aGVsbG8="}]}]`},
		{"openai-chat-completions", "chat-completion", "messages", `[{"role":"user","content":[{"type":"text","text":"inspect"},{"type":"image_url","image_url":{"url":"data:image/png;base64,aGVsbG8="}}]}]`},
		{"deepseek-chat", "deepseek-chat", "messages", `[{"role":"user","content":[{"type":"text","text":"inspect"},{"type":"image_url","image_url":{"url":"data:image/png;base64,aGVsbG8="}}]}]`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			adapter := officialPackageAdapter(t, tt.name+".yingce-plugin", tt.provider)
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
				Capability: CapabilityText, Model: "test-model", Prompt: "inspect",
				Images: []MediaReference{{DataURL: image}},
			}})
			if err != nil {
				t.Fatal(err)
			}
			got := manifestTestBody(t, spec)[tt.field]
			var want any
			if err := json.Unmarshal([]byte(tt.want), &want); err != nil {
				t.Fatal(err)
			}
			gotJSON, _ := json.Marshal(got)
			wantJSON, _ := json.Marshal(want)
			if string(gotJSON) != string(wantJSON) {
				t.Fatalf("media mapping = %s, want %s", gotJSON, wantJSON)
			}
		})
	}
}

func TestOfficialNativeTextProtocolsPreserveHistoryAndRemoteImages(t *testing.T) {
	for _, tt := range []struct{ name, provider, field, imageKey string }{
		{"google-gemini-generate-content", "gemini-generate-content", "contents", "fileData"},
		{"anthropic-messages", "claude-api", "messages", "source"},
		{"openai-responses", "openai-response", "input", "image_url"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			adapter := officialPackageAdapter(t, tt.name+".yingce-plugin", tt.provider)
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
				Capability: CapabilityText, Model: "test-model", Prompt: "inspect",
				Messages: []Message{{Role: "user", Content: "question"}, {Role: "assistant", Content: "answer"}},
				Images:   []MediaReference{{URL: "https://example.com/product.png"}, {DataURL: "data:image/jpeg;base64,aGVsbG8="}},
			}})
			if err != nil {
				t.Fatal(err)
			}
			messages := manifestTestBody(t, spec)[tt.field].([]any)
			if len(messages) != 3 {
				t.Fatalf("history length = %d, want 3", len(messages))
			}
			for i, text := range []string{"question", "answer"} {
				message := messages[i].(map[string]any)
				if tt.field == "contents" {
					if message["parts"].([]any)[0].(map[string]any)["text"] != text {
						t.Fatal("Gemini lost string history")
					}
					if i == 1 && message["role"] != "model" {
						t.Fatal("Gemini assistant role must be model")
					}
				} else if message["content"] != text {
					t.Fatal("string history changed")
				}
			}
			field := "content"
			if tt.field == "contents" {
				field = "parts"
			}
			parts := messages[2].(map[string]any)[field].([]any)
			if len(parts) != 3 || parts[1].(map[string]any)[tt.imageKey] == nil {
				t.Fatal("text and both images must remain separate, ordered blocks")
			}
			remote := parts[1].(map[string]any)[tt.imageKey]
			if source, ok := remote.(map[string]any); ok {
				key := "url"
				if tt.field == "contents" {
					key = "fileUri"
				} else if source["type"] != "url" {
					t.Fatal("Claude remote image must use a URL source")
				}
				remote = source[key]
			}
			if remote != "https://example.com/product.png" {
				t.Fatal("remote image URL changed")
			}
		})
	}
}
