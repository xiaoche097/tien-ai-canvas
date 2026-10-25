package prompts

import (
	_ "embed"
	"encoding/json"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

//go:embed ecommerce_defaults.json
var ecommerceWorkflowDefaults []byte

type ecommerceWorkflowDefault struct {
	Operation string   `json:"operation"`
	Label     string   `json:"label"`
	Content   string   `json:"content"`
	Variables []string `json:"variables"`
}

type EcommercePromptTemplate struct {
	Operation       string `json:"operation"`
	Content         string `json:"content"`
	TemplateID      string `json:"templateId"`
	TemplateVersion int    `json:"templateVersion"`
}

func ecommerceWorkflowPromptDefinitions() []PromptOperationDefinition {
	var defaults []ecommerceWorkflowDefault
	if err := json.Unmarshal(ecommerceWorkflowDefaults, &defaults); err != nil {
		panic(err)
	}
	definitions := make([]PromptOperationDefinition, 0, len(defaults))
	for _, item := range defaults {
		variables := make([]PromptTemplateVariable, 0, len(item.Variables))
		for _, name := range item.Variables {
			variables = append(variables, PromptTemplateVariable{Label: name, Placeholder: "{{" + name + "}}"})
		}
		definitions = append(definitions, PromptOperationDefinition{
			Operation: item.Operation, Label: "电商设计室 · " + item.Label, Category: "电商设计室", OutputType: "text",
			Description: "从电商设计室原有提示词迁移。变量由业务流程传入，结构化结果与生成参数仍由原流程校验。",
			Variables:   variables, DefaultContent: item.Content,
		})
	}
	return definitions
}

func (s *Service) EcommercePromptTemplates(user *model.User) ([]EcommercePromptTemplate, error) {
	if user == nil || user.ID == "" {
		return nil, kernel.BadAuthRequest("请先登录")
	}
	templates := make([]EcommercePromptTemplate, 0)
	for _, definition := range ecommerceWorkflowPromptDefinitions() {
		// Keep placeholders intact; product context is substituted in the isolated Motu request.
		values := make(map[string]string, len(definition.Variables))
		for _, variable := range definition.Variables {
			values[variable.Label] = variable.Placeholder
		}
		compiled, err := s.CompilePrompt(user.ID, definition.Operation, values)
		if err != nil {
			return nil, err
		}
		templates = append(templates, EcommercePromptTemplate{Operation: definition.Operation, Content: compiled.Content, TemplateID: compiled.TemplateID, TemplateVersion: compiled.TemplateVersion})
	}
	return templates, nil
}
