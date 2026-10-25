//go:build cgo

package app

import (
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/prompts"
	"yingce/backend/internal/repository"
)

func TestTryOnEnabledVersionsAreUsedWithoutLosingProtectedImageRoles(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.PromptTemplate{}, &model.UserPromptCustomization{}); err != nil {
		t.Fatal(err)
	}
	repo := repository.New(db)
	domain := prompts.New(repo, nil)
	if err := domain.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.PromptTemplate{}).Where("operation LIKE ?", "try_on_%").Count(&count)
	if count != 11 {
		t.Fatalf("seeded %d templates, want 11", count)
	}
	service := &Service{repo: repo}
	input := canvasGenerationInput{Mode: "image", Config: providerConfig{Model: "gpt-image-2"}, ReferenceImages: []providerMedia{{StorageKey: "resource:product"}}, Metadata: map[string]any{"tryOn": map[string]any{"tool": "outfit", "productCount": 1, "referenceMode": "smart", "generationMode": "professional", "description": ""}}}
	compiled, err := service.compileTryOnPrompt("fixture-user", input)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(compiled, "GPT 图像执行约定") || !strings.Contains(compiled, "浅灰棚拍") || !strings.Contains(compiled, "商品版型") {
		t.Fatal("default model adaptation or empty-preference workflow missing")
	}
	if err := repo.SavePromptTemplate(&model.PromptTemplate{ID: "custom-role", Operation: "try_on_outfit", Name: "品牌定制角色", Version: 2, Content: "这是管理员启用的换装角色，采用品牌指定的摄影风格。", OutputType: "text", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	if err := repo.SavePromptTemplate(&model.PromptTemplate{ID: "custom-adapter", Operation: "try_on_adapter_gemini", Name: "Gemini 定制", Version: 2, Content: "这是管理员启用的 Gemini 摄影适配。", OutputType: "text", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	if err := domain.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	input.Config.Model = "gemini-3.1-flash-image"
	compiled, err = service.compileTryOnPrompt("fixture-user", input)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(compiled, "管理员启用的换装角色") || !strings.Contains(compiled, "管理员启用的 Gemini") || !strings.Contains(compiled, "图 1～1") || strings.Contains(compiled, "GPT 图像执行约定") {
		t.Fatal("enabled role/adapter versions or protected roles were not respected")
	}
}
