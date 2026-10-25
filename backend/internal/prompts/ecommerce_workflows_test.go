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

func TestEcommerceWorkflowVersionsPreserveDefaultsAndUserScope(t *testing.T) {
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
	templates, err := svc.EcommercePromptTemplates(user)
	if err != nil {
		t.Fatal(err)
	}
	definitions := ecommerceWorkflowPromptDefinitions()
	if len(templates) != 21 || len(definitions) != 21 {
		t.Fatal("workflow catalog incomplete")
	}
	for index, template := range templates {
		definition := definitions[index]
		registered, ok := PromptDefinition(template.Operation)
		if !ok || registered.Category != "电商设计室" || template.TemplateVersion != 1 || template.Content != definition.DefaultContent {
			t.Fatalf("original workflow body changed: %s", template.Operation)
		}
		if err := validatePromptPlaceholders(definition, template.Content); err != nil {
			t.Fatal(err)
		}
	}
	styleBefore, err := svc.CompileEcommerceStyle(user, "tech")
	if err != nil {
		t.Fatal(err)
	}
	enabled := true
	operation := "ecommerce_workflow_analysis_image"
	_, err = svc.CreatePromptTemplate(user, PromptTemplateRequest{Operation: operation, Name: "分析新版本", Content: "新版分析 {{素材摘要}}", Enabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.UpdateUserPromptCustomization(user, operation, UserPromptCustomizationRequest{Mode: "append", Content: "用户专属要求"}); err != nil {
		t.Fatal(err)
	}
	if err := svc.EnsureDefaultPromptTemplates(); err != nil {
		t.Fatal(err)
	}
	for _, actor := range []*model.User{user, {ID: "user-2"}} {
		current, err := svc.EcommercePromptTemplates(actor)
		if err != nil {
			t.Fatal(err)
		}
		for _, template := range current {
			if template.Operation != operation {
				continue
			}
			if template.TemplateVersion != 2 || !strings.Contains(template.Content, "新版分析 {{素材摘要}}") {
				t.Fatal("active version or placeholders lost")
			}
			if strings.Contains(template.Content, "用户专属要求") != (actor.ID == user.ID) {
				t.Fatal("customizations crossed user scope")
			}
		}
	}
	styleAfter, err := svc.CompileEcommerceStyle(user, "tech")
	if err != nil || styleBefore != styleAfter {
		t.Fatal("workflow version activation changed a style template")
	}
	if _, err := svc.EcommercePromptTemplates(nil); err == nil {
		t.Fatal("anonymous request accepted")
	}
	if _, err := svc.CreatePromptTemplate(user, PromptTemplateRequest{Operation: operation, Name: "错误变量", Content: "{{不存在的变量}}"}); err == nil {
		t.Fatal("unknown placeholder accepted")
	}
}
