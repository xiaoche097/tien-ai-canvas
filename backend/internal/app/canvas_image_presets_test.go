package app

import (
	"fmt"
	"gorm.io/gorm"
	"reflect"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/prompts"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/tools"
)

func newCanvasImagePresetTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db := newSQLiteTestDB(t)
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), t.TempDir())
	if err := svc.EnsureBuiltinTools(); err != nil {
		t.Fatal(err)
	}
	if err := svc.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	return svc, db
}

func TestCanvasImagePresetsPreserveLegacyTokensAndParameters(t *testing.T) {
	svc, _ := newCanvasImagePresetTestService(t)
	presets, err := tools.BuiltinImagePresets()
	if err != nil || len(presets) != 9 {
		t.Fatalf("preset catalog: %d %v", len(presets), err)
	}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	templates, definitions, err := svc.AdminPromptTemplates(admin)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, definition := range definitions {
		if definition.Category == "画布图片预设" {
			count++
		}
	}
	if count != 9 {
		t.Fatalf("admin image preset definitions: %d", count)
	}
	if err := svc.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	reloaded, _, err := svc.AdminPromptTemplates(admin)
	if err != nil || len(reloaded) != len(templates) {
		t.Fatalf("startup duplicated templates: %d -> %d, %v", len(templates), len(reloaded), err)
	}
	for _, preset := range presets {
		t.Run(preset.Key, func(t *testing.T) {
			before, err := svc.repo.ToolForUser("alice", preset.ID)
			if err != nil {
				t.Fatal(err)
			}
			token := fmt.Sprintf("@[tool:nine_grid:%d:legacy-name:Grid3x3]", preset.ID)
			actual, err := svc.ResolveToolMentionTokens("alice", "image", "user instructions\n"+token)
			if err != nil || actual != "user instructions\n"+strings.TrimSpace(preset.Prompt) {
				t.Fatalf("legacy prompt changed: %q %v", actual, err)
			}
			after, err := svc.repo.ToolForUser("alice", preset.ID)
			if err != nil || !reflect.DeepEqual(before, after) || after.Ratio != preset.Ratio {
				t.Fatalf("tool parameters changed: %+v %v", after, err)
			}
		})
	}
	if _, _, err := svc.AdminPromptTemplates(&model.User{ID: "alice", Role: model.UserRoleUser}); err == nil {
		t.Fatal("non-admin read accepted")
	}
}

func TestCanvasImagePresetVersionActivationAndAccess(t *testing.T) {
	svc, db := newCanvasImagePresetTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	tool, err := svc.repo.ToolForUser("alice", 79)
	if err != nil {
		t.Fatal(err)
	}
	operation, ok := prompts.CanvasImagePresetOperation(&tool)
	if !ok {
		t.Fatal("builtin preset not mapped")
	}
	const token = "@[tool:nine_grid:79:old-label:Grid3x3]"
	enabled := false
	draft, err := svc.CreatePromptTemplate(admin, PromptTemplateRequest{Operation: operation, Name: "new version", Content: "updated contact sheet", Enabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := svc.ResolveToolMentionTokens("alice", "image", token); err != nil || got != tool.Prompt {
		t.Fatalf("draft changed generation: %q %v", got, err)
	}
	enabled = true
	if _, err := svc.UpdatePromptTemplate(admin, draft.ID, PromptTemplateRequest{Operation: operation, Name: draft.Name, Content: draft.Content, Enabled: &enabled}); err != nil {
		t.Fatal(err)
	}
	if err := svc.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	if got, err := svc.ResolveToolMentionTokens("alice", "image", token+"\nkeep my details"); err != nil || got != draft.Content+"\nkeep my details" {
		t.Fatalf("active version not used: %q %v", got, err)
	}
	if _, err := svc.CreatePromptTemplate(admin, PromptTemplateRequest{Operation: operation, Name: "nested", Content: token}); err == nil {
		t.Fatal("nested template accepted")
	}
	if _, err := svc.CreatePromptTemplate(&model.User{ID: "alice", Role: model.UserRoleUser}, PromptTemplateRequest{Operation: operation, Name: "unauthorized", Content: "changed"}); err == nil {
		t.Fatal("non-admin template write accepted")
	}
	custom, err := svc.CreateTool("alice", ToolMutationRequest{Type: "nine_grid", Label: "my preset", Prompt: "private custom prompt"})
	if err != nil {
		t.Fatal(err)
	}
	customToken := fmt.Sprintf("@[tool:nine_grid:%d:my-preset:Grid3x3]", custom.ID)
	if got, err := svc.ResolveToolMentionTokens("alice", "image", customToken); err != nil || got != custom.Prompt {
		t.Fatalf("user preset changed: %q %v", got, err)
	}
	for _, input := range []struct{ user, mode, token string }{{"bob", "image", customToken}, {"", "image", token}, {"alice", "video", token}} {
		if _, err := svc.ResolveToolMentionTokens(input.user, input.mode, input.token); err == nil {
			t.Fatalf("unauthorized preset accepted: %+v", input)
		}
	}
	if err := db.Model(&model.Tool{}).Where("id = ?", 79).Update("enabled", false).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ResolveToolMentionTokens("alice", "image", token); err == nil {
		t.Fatal("disabled tool accepted")
	}
}

func TestCanvasImagePresetTemplateDatabaseFailureIsNotHidden(t *testing.T) {
	svc, db := newCanvasImagePresetTestService(t)
	if err := db.Migrator().DropTable(&model.PromptTemplate{}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ResolveToolMentionTokens("alice", "image", "@[tool:nine_grid:79:old:Grid3x3]"); err == nil {
		t.Fatal("template database failure silently used old prompt")
	}
}
