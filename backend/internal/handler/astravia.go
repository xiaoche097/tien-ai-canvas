package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/astravia"
	"yingce/backend/internal/service"
)

func RegisterAstraviaRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/integrations/astravia", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		status, err := svc.AstraviaStatus(c.Request.Context(), user.ID, c.Query("canvasId"))
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, status)
	})
	r.POST("/integrations/astravia", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "astravia-connect:"+user.ID, 5, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
		var req service.AstraviaConnectRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, 400, errors.New("连接参数无效"))
			return
		}
		status, err := svc.ConnectAstravia(c.Request.Context(), user.ID, req)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, status)
	})
	r.DELETE("/integrations/astravia", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.DisconnectAstravia(user.ID, c.Query("canvasId")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"revoked": true})
	})
	path := "/integrations/astravia/mcp/:id"
	mcpAuth := func(c *gin.Context) (string, string, bool) {
		// Native stdio bridge sends no Origin. Browser-originated MCP calls are refused.
		if c.GetHeader("Origin") != "" {
			fail(c, 403, errors.New("MCP 只接受本机连接程序调用"))
			return "", "", false
		}
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			fail(c, 401, errors.New("需要 Astravia 连接授权"))
			return "", "", false
		}
		userID, canvasID, err := svc.AstraviaAuthorize(c.Param("id"), strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			failService(c, err)
			return "", "", false
		}
		return userID, canvasID, true
	}
	r.GET(path, func(c *gin.Context) {
		if _, _, ok := mcpAuth(c); ok {
			c.Header("Allow", "POST")
			c.Status(http.StatusMethodNotAllowed)
		}
	})
	r.POST(path, func(c *gin.Context) {
		userID, canvasID, authorized := mcpAuth(c)
		if !authorized {
			return
		}
		if !enforceRateLimit(c, "astravia-mcp:"+userID, 120, time.Minute) {
			return
		}
		version := c.GetHeader("MCP-Protocol-Version")
		if version != "" && version != "2025-03-26" && version != "2025-06-18" {
			fail(c, 400, errors.New("不支持的 MCP 协议版本"))
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10)
		var req struct {
			JSONRPC string          `json:"jsonrpc"`
			ID      json.RawMessage `json:"id"`
			Method  string          `json:"method"`
			Params  json.RawMessage `json:"params"`
		}
		decoder := json.NewDecoder(c.Request.Body)
		if decoder.Decode(&req) != nil || req.JSONRPC != "2.0" || decoder.Decode(&struct{}{}) != io.EOF {
			c.JSON(400, gin.H{"jsonrpc": "2.0", "id": nil, "error": gin.H{"code": -32600, "message": "Invalid request"}})
			return
		}
		if len(req.ID) == 0 {
			if strings.HasPrefix(req.Method, "notifications/") {
				c.Status(202)
			} else {
				c.Status(400)
			}
			return
		}
		rpcError := func(code int, message string) {
			c.JSON(200, gin.H{"jsonrpc": "2.0", "id": req.ID, "error": gin.H{"code": code, "message": message}})
		}
		var result any
		switch req.Method {
		case "initialize":
			var params struct {
				ProtocolVersion string `json:"protocolVersion"`
			}
			if json.Unmarshal(req.Params, &params) != nil {
				rpcError(-32602, "Invalid initialize parameters")
				return
			}
			negotiated := "2025-06-18"
			if params.ProtocolVersion == "2025-03-26" {
				negotiated = params.ProtocolVersion
			}
			result = gin.H{"protocolVersion": negotiated, "capabilities": gin.H{"tools": gin.H{}}, "serverInfo": gin.H{"name": "jingche", "version": "1.1.0"}, "instructions": "境彻画布已提供连接状态工具。用户询问是否连接或安排境彻工作时，先调用 jingche_connection_status，明确告知当前画布和可用能力；失败时如实说明不可用。你在 Astravia 中安排工作，境彻负责授权画布内的图片、视频生成。先读画布和模型，再提交有明确预算的工作；等待审批时请向用户确认。Astravia 的 Skills 不会自动同步到境彻。"}
		case "ping":
			result = gin.H{}
		case "tools/list":
			result = gin.H{"tools": astravia.Tools()}
		case "tools/call":
			var params struct {
				Name      string          `json:"name"`
				Arguments json.RawMessage `json:"arguments"`
			}
			if json.Unmarshal(req.Params, &params) != nil || params.Name == "" {
				rpcError(-32602, "Invalid tool parameters")
				return
			}
			policy, available := loadRuntimePolicy(c, svc)
			if !available {
				return
			}
			if params.Name == "jingche_submit_job" && !enforceRateLimit(c, "tasks:"+userID, policy.Request.TaskCreatePerMinute, time.Minute) {
				return
			}
			value, err := svc.AstraviaCall(c.Request.Context(), userID, canvasID, params.Name, params.Arguments)
			if err != nil {
				result = astraviaToolFailure(c, err)
			} else {
				encoded, err := json.Marshal(value)
				if err != nil {
					rpcError(-32603, internalErrorMessage)
					return
				}
				result = gin.H{"content": []gin.H{{"type": "text", "text": string(encoded)}}}
			}
		default:
			rpcError(-32601, "Method not found")
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(200, gin.H{"jsonrpc": "2.0", "id": req.ID, "result": result})
	})
}

func astraviaToolFailure(c *gin.Context, err error) gin.H {
	message, code, reason, retryable := internalErrorMessage, http.StatusInternalServerError, service.ReasonForStatus(http.StatusInternalServerError), false
	var modelErr *service.ModelError
	var appErr *service.AppError
	if errors.As(err, &modelErr) && modelErr.AppError != nil {
		appErr = modelErr.AppError
	} else {
		errors.As(err, &appErr)
	}
	if appErr != nil && validErrorStatus(appErr.Status) {
		if strings.TrimSpace(appErr.Message) != "" {
			message = appErr.Message
		}
		code, reason, retryable = appErr.Code, appErr.Reason, appErr.Retryable
		if code == 0 {
			code = appErr.Status
		}
	} else {
		logHandlerError(c, http.StatusInternalServerError, err)
	}
	return gin.H{"isError": true, "content": []gin.H{{"type": "text", "text": message}}, "structuredContent": gin.H{"code": code, "reason": reason, "retryable": retryable}}
}
