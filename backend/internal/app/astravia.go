package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"yingce/backend/internal/astravia"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

type AstraviaConnectRequest struct {
	CanvasID   string `json:"canvasId"`
	APIBaseURL string `json:"apiBaseUrl"`
}

type AstraviaStatus struct {
	ID         string    `json:"id"`
	Authorized bool      `json:"authorized"`
	ExpiresAt  time.Time `json:"expiresAt,omitempty"`
}

type AstraviaConnection struct {
	ID        string    `json:"id"`
	URL       string    `json:"url"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type astraviaGrant struct {
	UserID    string    `json:"userId"`
	CanvasID  string    `json:"canvasId"`
	TokenHash string    `json:"tokenHash"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func astraviaID(userID, canvasID string) string {
	sum := sha256.Sum256([]byte(userID + "\x00" + canvasID))
	return hex.EncodeToString(sum[:20])
}

func (s *Service) AstraviaStatus(ctx context.Context, userID, canvasID string) (*AstraviaStatus, error) {
	if _, err := s.UserCanvasProjectMetadata(userID, canvasID); err != nil {
		return nil, err
	}
	status := &AstraviaStatus{ID: astraviaID(userID, canvasID)}
	id := astraviaID(userID, canvasID)
	setting, err := s.repo.SystemSettingOptional("astravia:" + id)
	if err != nil {
		return nil, err
	}
	if setting == nil {
		return status, nil
	}
	var grant astraviaGrant
	if json.Unmarshal([]byte(setting.ValueJSON), &grant) != nil || grant.UserID != userID || grant.CanvasID != canvasID || time.Now().After(grant.ExpiresAt) {
		return status, nil
	}
	status.ExpiresAt = grant.ExpiresAt
	status.Authorized = true
	return status, nil
}

func (s *Service) ConnectAstravia(ctx context.Context, userID string, req AstraviaConnectRequest) (*AstraviaConnection, error) {
	if req.CanvasID == "" {
		return nil, kernel.BadAuthRequest("请先打开并保存需要授权的画布")
	}
	if _, err := s.UserCanvasProjectMetadata(userID, req.CanvasID); err != nil {
		return nil, err
	}
	u, err := astravia.LoopbackURL(req.APIBaseURL)
	if err != nil {
		return nil, kernel.BadAuthRequest(err.Error())
	}
	if strings.TrimRight(u.Path, "/") != "/api" {
		return nil, kernel.BadAuthRequest("境彻 API 路径必须为 /api")
	}
	if !s.astraviaConnectMu.TryLock() {
		return nil, kernel.NewAppError(409, "正在等待 Astravia 连接授权，请先完成当前请求")
	}
	defer s.astraviaConnectMu.Unlock()
	id := astraviaID(userID, req.CanvasID)
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(secret)
	hash := sha256.Sum256([]byte(token))
	grant := astraviaGrant{UserID: userID, CanvasID: req.CanvasID, TokenHash: hex.EncodeToString(hash[:]), ExpiresAt: time.Now().Add(30 * 24 * time.Hour)}
	value, _ := json.Marshal(grant)
	if err := s.repo.SaveSystemSetting(&model.SystemSetting{Key: "astravia:" + id, ValueJSON: string(value), UpdatedBy: userID}); err != nil {
		return nil, err
	}
	u.Path = "/api/integrations/astravia/mcp/" + id
	return &AstraviaConnection{ID: id, URL: u.String(), Token: token, ExpiresAt: grant.ExpiresAt}, nil
}

func (s *Service) DisconnectAstravia(userID, canvasID string) error {
	if _, err := s.UserCanvasProjectMetadata(userID, canvasID); err != nil {
		return err
	}
	if !s.astraviaConnectMu.TryLock() {
		return kernel.NewAppError(409, "请先完成当前 Astravia 连接请求")
	}
	defer s.astraviaConnectMu.Unlock()
	id := astraviaID(userID, canvasID)
	if err := s.repo.DeleteSystemSetting("astravia:" + id); err != nil {
		return err
	}
	return nil
}

func (s *Service) AstraviaAuthorize(id, token string) (string, string, error) {
	denied := kernel.Unauthorized("Astravia 授权无效或已过期，请从画布重新连接")
	if len(id) != 40 || len(token) != 64 {
		return "", "", denied
	}
	setting, err := s.repo.SystemSettingOptional("astravia:" + id)
	if err != nil {
		return "", "", err
	}
	if setting == nil {
		return "", "", denied
	}
	var grant astraviaGrant
	if json.Unmarshal([]byte(setting.ValueJSON), &grant) != nil || time.Now().After(grant.ExpiresAt) || astraviaID(grant.UserID, grant.CanvasID) != id {
		return "", "", denied
	}
	sum := sha256.Sum256([]byte(token))
	if subtle.ConstantTimeCompare([]byte(grant.TokenHash), []byte(hex.EncodeToString(sum[:]))) != 1 {
		return "", "", denied
	}
	user, err := s.repo.User(grant.UserID)
	if err != nil || user.Status != model.UserStatusActive {
		return "", "", denied
	}
	if _, err := s.UserCanvasProjectMetadata(grant.UserID, grant.CanvasID); err != nil {
		return "", "", err
	}
	return grant.UserID, grant.CanvasID, nil
}

// This is a narrow delegation surface. All writes use existing Agent admission,
// billing, approval and canvas mutation paths instead of an external write bypass.
func (s *Service) AstraviaCall(ctx context.Context, userID, canvasID, name string, args json.RawMessage) (any, error) {
	metadata, err := s.UserCanvasProjectMetadata(userID, canvasID)
	if err != nil {
		return nil, err
	}
	switch name {
	case "jingche_connection_status":
		return map[string]any{"connected": true, "canvasId": canvasID, "canvasName": metadata.Title, "service": "境彻画布", "capabilities": []string{"读取画布", "查询模型与技能", "安排图片和视频生成", "查询进度", "确认审批", "取消工作"}, "message": "Astravia 已能访问境彻。你可以安排当前画布的图片、视频和分镜工作；生成前请确认模型和预算。"}, nil
	case "jingche_get_canvas":
		return s.UserCanvasProject(userID, canvasID)
	case "jingche_list_models":
		actor, err := s.repo.User(userID)
		if err != nil {
			return nil, err
		}
		catalog, err := s.ModelCatalogForUser(actor, nil)
		if err != nil {
			return nil, err
		}
		logical := catalog.Models
		// Explicit projection excludes upstream URLs, headers and credentials.
		selections := []map[string]any{}
		for _, channel := range catalog.Channels {
			for _, item := range channel.Models {
				if !item.Available { continue }
				selections = append(selections, map[string]any{"id": item.ID, "channelId": channel.ID, "channelModelKey": item.ModelKey, "name": item.DisplayName, "capability": item.Capability, "priceLabel": item.PriceLabel, "capabilityConfig": item.CapabilityConfig})
			}
		}
		textLogical := []PublicLogicalModel{}
		for _, item := range logical {
			if item.Capability == "text" {
				textLogical = append(textLogical, item)
			}
		}
		textChannels := []map[string]any{}
		for _, item := range selections {
			if item["capability"] == "text" {
				textChannels = append(textChannels, item)
			}
		}
		return map[string]any{"models": logical, "channelModels": selections, "agentTextModels": map[string]any{"logicalModels": textLogical, "channelModels": textChannels}}, nil
	case "jingche_list_skills":
		return s.AddedSkills(userID)
	case "jingche_submit_job":
		var input struct {
			CloudAgentRequest
			ParentRunID string   `json:"parentRunId"`
			SkillIDs    []string `json:"skillIds"`
		}
		if err := json.Unmarshal(args, &input); err != nil {
			return nil, kernel.BadAuthRequest("工作安排参数无效")
		}
		if input.CanvasID != "" && input.CanvasID != canvasID {
			return nil, kernel.Forbidden("连接仅允许操作授权画布")
		}
		input.CanvasID = canvasID
		input.PermissionMode = "request_approval"
		input.ContextScope = []string{"canvas"}
		input.PinnedSkillIDs = input.SkillIDs
		if input.ParentRunID != "" {
			if err := s.astraviaRunScope(userID, canvasID, input.ParentRunID); err != nil {
				return nil, err
			}
		}
		return s.CreateCloudAgentRun(userID, input.CloudAgentRequest, input.ParentRunID)
	case "jingche_get_job", "jingche_cancel_job", "jingche_decide_approval":
		var input struct {
			RunID      string `json:"runId"`
			ApprovalID string `json:"approvalId"`
			Decision   string `json:"decision"`
			Reason     string `json:"reason"`
		}
		if err := json.Unmarshal(args, &input); err != nil || input.RunID == "" {
			return nil, kernel.BadAuthRequest("需要有效的 runId")
		}
		if err := s.astraviaRunScope(userID, canvasID, input.RunID); err != nil {
			return nil, err
		}
		if name == "jingche_cancel_job" {
			if err := s.CancelCloudAgent(ctx, userID, input.RunID); err != nil {
				return nil, err
			}
		}
		if name == "jingche_decide_approval" {
			if err := s.DecideCloudAgentApproval(userID, input.RunID, input.ApprovalID, input.Decision, input.Reason); err != nil {
				return nil, err
			}
		}
		return s.CloudAgentRun(userID, input.RunID)
	default:
		return nil, kernel.BadAuthRequest("未知境彻工具")
	}
}

func (s *Service) astraviaRunScope(userID, canvasID, runID string) error {
	run, err := s.CloudAgentRun(userID, runID)
	if err != nil {
		return err
	}
	if run.CanvasID != canvasID {
		return kernel.Forbidden("不能访问其他画布的工作")
	}
	return nil
}
