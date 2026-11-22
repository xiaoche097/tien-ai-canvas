package prompts

import (
	"strings"
	"unicode/utf8"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

const ecommerceStylePrefix = "ecommerce_style_"

var ecommerceStyles = []struct{ key, label, instruction string }{
	{"generic_clean", "通用简洁", "采用清晰中性的电商视觉，浅色背景、简洁布局、自然光线，突出商品轮廓和真实材质。标题与卖点有明确层级，减少无关装饰。"},
	{"premium", "高级质感", "采用克制的高级商业摄影，细腻定向光与真实材质特写，留白充足、字体精练、色彩协调。以工艺与细节表达品质，不堆砌装饰。"},
	{"soft_lifestyle", "柔和生活方式", "采用柔和自然光、温暖低饱和配色和可信的日常生活场景，展示商品使用状态。背景与道具服务于商品，保持轻松亲近的视觉节奏。"},
	{"conversion_focused", "转化导向", "以商品、主要卖点和购买理由建立清晰阅读顺序，标题简短醒目、关键信息易读，行动提示适度。所有功效、参数与优惠须有商品资料依据，不能编造。"},
	{"tech", "科技感", "采用精确线条、清晰结构与冷静配色，通过定向光、真实材质和细节呈现科技感。技术信息保持可读，不添加虚构结构、参数或功能。"},
	{"food_health", "食品食养", "采用自然、温暖、可信的食品摄影，突出真实食材、质地、制作或食用场景。配色清爽，营养信息仅使用已提供数据，不暗示未经证实的医疗效果。"},
	{"chinese_heritage", "中式传承", "将中式色彩、留白和传统材质细节融入现代电商排版，适量使用有产品依据的文化元素。商品保持主体地位，不编造历史、产地或非遗认证。"},
	{"minimal_nordic", "极简北欧", "采用通透自然光、低饱和中性色、朴素材质和充足留白，构图安静而有秩序。减少装饰，突出商品实用性、轮廓和触感。"},
	{"luxury", "奢华高端", "采用精致定向光、深浅对比和细腻材质表达，配色克制且统一，排版有节奏。避免廉价金色堆砌、虚构品牌背书或绝对化宣传。"},
	{"custom", "自定义风格", "根据用户或商品分析给出的风格描述安排配色、光影、材质氛围和排版，不强行套入其他预设。描述不充分时保持清晰可信的商业摄影，不改动商品身份。"},
}

func ecommerceStylePromptDefinitions() []PromptOperationDefinition {
	definitions := make([]PromptOperationDefinition, 0, len(ecommerceStyles))
	for _, style := range ecommerceStyles {
		definitions = append(definitions, PromptOperationDefinition{
			Operation: ecommerceStylePrefix + style.key, Label: "电商设计室 · " + style.label,
			Category: "电商设计室", OutputType: "text",
			Description:    "用于商品页规划、头图与详情图生成及重绘的视觉风格。比例、商品身份、语言和输出协议仍由原任务控制。",
			Variables:      []PromptTemplateVariable{{Label: "风格描述", Placeholder: "{{风格描述}}"}},
			DefaultContent: "【电商设计室视觉风格】\n风格描述：{{风格描述}}\n" + style.instruction,
		})
	}
	return definitions
}

func (s *Service) CompileEcommerceStyle(user *model.User, style string) (CompiledPrompt, error) {
	if user == nil || user.ID == "" {
		return CompiledPrompt{}, kernel.BadAuthRequest("请先登录")
	}
	style = strings.TrimSpace(style)
	if style == "" || utf8.RuneCountInString(style) > 2000 {
		return CompiledPrompt{}, kernel.BadAuthRequest("风格描述需为 1～2000 个字符")
	}
	key, description := "custom", style
	for _, preset := range ecommerceStyles {
		if preset.key == style {
			key, description = preset.key, preset.label
			break
		}
	}
	return s.CompilePrompt(user.ID, ecommerceStylePrefix+key, map[string]string{"风格描述": description})
}
