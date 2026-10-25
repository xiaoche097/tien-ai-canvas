package prompts

import (
	"strings"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestEcommerceStyleCatalog(t *testing.T) {
	definitions := ecommerceStylePromptDefinitions()
	if len(definitions) != 10 {
		t.Fatalf("got %d styles, want 10", len(definitions))
	}
	for _, definition := range definitions {
		registered, ok := PromptDefinition(definition.Operation)
		if !ok || registered.Category != "电商设计室" || registered.OutputType != "text" {
			t.Fatalf("invalid ecommerce category: %s", definition.Operation)
		}
		content, err := RenderPromptTemplate(definition, definition.DefaultContent, map[string]string{"风格描述": "户外休闲"})
		if err != nil || !strings.Contains(content, "户外休闲") || strings.Contains(content, "{{") {
			t.Fatalf("style rendering failed: %v", err)
		}
	}
}

func TestEcommerceStyleUsesActiveVersionAndUserScope(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.PromptTemplate{}, &model.UserPromptCustomization{}); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), nil)
	if err := svc.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	user := &model.User{ID: "user-1"}
	first, err := svc.CompileEcommerceStyle(user, "tech")
	if err != nil || first.TemplateVersion != 1 {
		t.Fatalf("default version failed: %v", err)
	}
	enabled := true
	_, err = svc.CreatePromptTemplate(user, PromptTemplateRequest{Operation: "ecommerce_style_tech", Name: "科技风格新版", Content: "新视觉规则：{{风格描述}}", Enabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	active, err := svc.CompileEcommerceStyle(user, "tech")
	if err != nil || active.TemplateVersion != 2 || !strings.HasPrefix(active.Content, "新视觉规则：科技感") || !strings.Contains(active.Content, "风格适用边界") {
		t.Fatalf("active version not applied: %v", err)
	}
	if _, err := svc.UpdateUserPromptCustomization(user, "ecommerce_style_tech", UserPromptCustomizationRequest{Mode: "append", Content: "用户专属要求"}); err != nil {
		t.Fatal(err)
	}
	own, err := svc.CompileEcommerceStyle(user, "tech")
	if err != nil || !strings.Contains(own.Content, "用户专属要求") {
		t.Fatalf("customization missing: %v", err)
	}
	other, err := svc.CompileEcommerceStyle(&model.User{ID: "user-2"}, "tech")
	if err != nil || strings.Contains(other.Content, "用户专属要求") {
		t.Fatalf("customization crossed users: %v", err)
	}
	custom, err := svc.CompileEcommerceStyle(user, "户外机能·城市休闲")
	if err != nil || !strings.Contains(custom.Content, "户外机能·城市休闲") {
		t.Fatalf("detected style missing: %v", err)
	}
	if _, err := svc.CompileEcommerceStyle(nil, "tech"); err == nil {
		t.Fatal("anonymous compilation accepted")
	}
	if _, err := svc.CompileEcommerceStyle(user, " "); err == nil {
		t.Fatal("empty style accepted")
	}
}
