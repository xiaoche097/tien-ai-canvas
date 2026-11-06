// Package astravia connects to the installed Desktop through its authenticated local RPC.
package astravia

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

//go:embed bridge.mjs
var bridge []byte

type Desktop struct {
	Home string
}

func Local() (Desktop, error) {
	home := os.Getenv("ASTRAVIA_HOME")
	if home == "" {
		userHome, err := os.UserHomeDir()
		if err != nil {
			return Desktop{}, errors.New("无法定位 Astravia 数据目录")
		}
		home = filepath.Join(userHome, ".astravia")
	}
	return Desktop{Home: home}, nil
}

// Only literal loopback hosts are accepted, without DNS resolution or redirects.
func LoopbackURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("连接地址必须是本机 HTTP 地址")
	}
	if u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1" {
		return nil, errors.New("连接地址必须是本机 HTTP 地址")
	}
	return u, nil
}

func (d Desktop) call(ctx context.Context, method string, params any, target any) error {
	var endpoint struct{ Transport, URL, Token string }
	raw, err := os.ReadFile(filepath.Join(d.Home, "action-server.json"))
	if err != nil || json.Unmarshal(raw, &endpoint) != nil || endpoint.Transport != "http" || endpoint.Token == "" {
		return errors.New("未发现 Astravia 桌面服务；请打开 Astravia，并使用同一桌面账号启动本机连接程序")
	}
	u, err := LoopbackURL(endpoint.URL)
	if err != nil {
		return errors.New("Astravia 本地服务地址无效")
	}
	u.Path = "/rpc"
	body, err := json.Marshal(map[string]any{"id": "jingche-connector", "method": method, "params": params})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(body))
	if err != nil {
		return errors.New("无法创建 Astravia 请求")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+endpoint.Token)
	client := &http.Client{Timeout: 5 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("无法连接 Astravia，请确认桌面应用正在运行")
	}
	defer resp.Body.Close()
	var result struct {
		ID     string          `json:"id"`
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result) != nil || !result.OK || result.ID != "jingche-connector" {
		return errors.New("Astravia 未完成请求，请检查应用中的授权提示及 MCP 管理插件")
	}
	if target != nil {
		return json.Unmarshal(result.Result, target)
	}
	return nil
}

func (d Desktop) Available(ctx context.Context) error {
	var result []struct {
		ID string `json:"id"`
	}
	if err := d.call(ctx, "actions.search", map[string]string{"domain": "mcp"}, &result); err != nil {
		return err
	}
	for _, item := range result {
		if item.ID == "mcp.manage" {
			return nil
		}
	}
	return errors.New("Astravia 未启用 MCP 管理能力，请启用 Astravia Actions 插件")
}

// Credentials live under the user's Astravia directory, never in RPC arguments,
// command lines or logs. Windows files inherit the profile directory's ACL.
func (d Desktop) Install(ctx context.Context, id, endpoint, token string) error {
	configured, err := d.Configured(ctx, id)
	if err != nil {
		return err
	}
	node, err := exec.LookPath("node")
	if err != nil {
		return errors.New("连接需要本机安装 Node.js 20 或更新版本")
	}
	dir := filepath.Join(d.Home, "integrations", "jingche", id)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return errors.New("无法创建境彻连接目录")
	}
	if err := os.WriteFile(filepath.Join(dir, "bridge.mjs"), bridge, 0600); err != nil {
		return errors.New("无法安装境彻连接程序")
	}
	config, _ := json.Marshal(map[string]string{"url": endpoint, "token": token})
	credentialPath := filepath.Join(dir, "connection.json")
	if err := os.WriteFile(credentialPath+".new", config, 0600); err != nil {
		return errors.New("无法保存境彻连接凭据")
	}
	if err := os.Rename(credentialPath+".new", credentialPath); err != nil {
		_ = os.Remove(credentialPath + ".new")
		return errors.New("无法更新境彻连接凭据")
	}
	// The existing desktop permission already covers this exact bridge and canvas.
	// Refreshing its credential must not create a duplicate server or approval prompt.
	if configured {
		return nil
	}
	var result struct{ Status, Operation string }
	err = d.call(ctx, "actions.run", map[string]any{"actionId": "mcp.manage", "input": map[string]any{
		"operation": "upsert", "name": "jingche-" + id,
		"data": map[string]any{"type": "stdio", "command": node, "args": []string{filepath.Join(dir, "bridge.mjs"), filepath.Join(dir, "connection.json")}, "disabled": false, "autoApprove": []string{}},
	}}, &result)
	if err != nil {
		return err
	}
	if result.Status == "rejected" || result.Operation != "upsert" {
		return errors.New("Astravia 连接授权未通过")
	}
	return nil
}

func (d Desktop) Configured(ctx context.Context, id string) (bool, error) {
	name, err := d.serverName(ctx, id)
	return name != "", err
}

func (d Desktop) serverName(ctx context.Context, id string) (string, error) {
	var result struct {
		Servers []struct{ Name string } `json:"servers"`
	}
	if err := d.call(ctx, "actions.run", map[string]any{"actionId": "mcp.query", "input": map[string]string{"operation": "list"}}, &result); err != nil {
		return "", err
	}
	for _, server := range result.Servers {
		{
			var config struct {
				Type     string
				Disabled bool
				Command  string
				Args     []string
			}
			if err := d.call(ctx, "actions.run", map[string]any{"actionId": "mcp.query", "input": map[string]string{"operation": "get", "name": server.Name}}, &config); err != nil {
				return "", err
			}
			dir := filepath.Join(d.Home, "integrations", "jingche", id)
			if !config.Disabled && (config.Type == "" || config.Type == "stdio") && len(config.Args) == 2 && config.Args[0] == filepath.Join(dir, "bridge.mjs") && config.Args[1] == filepath.Join(dir, "connection.json") {
				return server.Name, nil
			}
		}
	}
	return "", nil
}

type ConnectionStatus struct {
	Available  bool   `json:"available"`
	Configured bool   `json:"configured"`
	Ready      bool   `json:"ready"`
	Connected  bool   `json:"connected"`
	ServerName string `json:"serverName,omitempty"`
	Message    string `json:"message,omitempty"`
}

func (d Desktop) Status(ctx context.Context, id, expectedEndpoint string) (*ConnectionStatus, error) {
	if err := d.Available(ctx); err != nil {
		return nil, err
	}
	status := &ConnectionStatus{Available: true}
	name, err := d.serverName(ctx, id)
	if err != nil {
		return nil, err
	}
	if name == "" {
		return status, nil
	}
	status.Configured = true
	status.ServerName = name
	var credential struct{ URL, Token string }
	raw, err := os.ReadFile(filepath.Join(d.Home, "integrations", "jingche", id, "connection.json"))
	if err != nil || json.Unmarshal(raw, &credential) != nil || len(credential.Token) != 64 {
		status.Message = "Astravia 已添加境彻，但连接凭据不可用，请重新连接"
		return status, nil
	}
	if expectedEndpoint != "" && credential.URL != expectedEndpoint {
		status.Message = "此连接指向另一个境彻入口；请在原入口使用，或在当前入口重新连接"
		return status, nil
	}
	if err := Probe(ctx, credential.URL, credential.Token); err != nil {
		status.Message = err.Error()
		return status, nil
	}
	status.Ready = true
	// Upgrade only our already-authorized bridge file; a running old process must
	// still reload once. Future credential rotations are read on every request.
	bridgePath := filepath.Join(d.Home, "integrations", "jingche", id, "bridge.mjs")
	installed, err := os.ReadFile(bridgePath)
	if err != nil || !bytes.Equal(installed, bridge) {
		if err := os.WriteFile(bridgePath, bridge, 0600); err != nil {
			status.Message = "境彻可达，但连接程序更新失败，请检查本机文件权限"
			return status, nil
		}
	}
	entries, err := os.ReadDir(filepath.Dir(bridgePath))
	if err != nil {
		return nil, errors.New("无法读取 Agent 会话连接状态")
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "runtime-") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var runtime struct {
			Connected  bool
			Origin     string
			LastSeenAt time.Time `json:"lastSeenAt"`
		}
		raw, err := os.ReadFile(filepath.Join(filepath.Dir(bridgePath), entry.Name()))
		if err != nil || json.Unmarshal(raw, &runtime) != nil {
			continue
		}
		endpoint, _ := LoopbackURL(credential.URL)
		age := time.Since(runtime.LastSeenAt)
		if runtime.Connected && endpoint != nil && runtime.Origin == endpoint.Scheme+"://"+endpoint.Host && age >= 0 && age < 45*time.Second {
			status.Connected = true
			break
		}
	}
	if !status.Connected {
		status.Message = "境彻服务可达，尚未验证 Agent 会话。请在 Astravia 重新加载 MCP 或新建对话后调用境彻工具。"
	}
	return status, nil
}

func (d Desktop) Connections(ctx context.Context) ([]*ConnectionStatus, error) {
	root := filepath.Join(d.Home, "integrations", "jingche")
	entries, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return []*ConnectionStatus{}, nil
	}
	if err != nil {
		return nil, errors.New("无法读取境彻连接列表")
	}
	result := []*ConnectionStatus{}
	for _, entry := range entries {
		if !entry.IsDir() || len(entry.Name()) != 40 {
			continue
		}
		if _, err := hex.DecodeString(entry.Name()); err != nil {
			continue
		}
		state, err := d.Status(ctx, entry.Name(), "")
		if err != nil {
			result = append(result, &ConnectionStatus{Message: err.Error()})
			continue
		}
		if state.Configured {
			result = append(result, state)
		}
	}
	return result, nil
}

// Verify the real backend's MCP handshake before installing a desktop configuration.
func Probe(ctx context.Context, endpoint, token string) error {
	u, err := LoopbackURL(endpoint)
	if err != nil {
		return err
	}
	body := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"jingche-connector","version":"1.0.0"}}}`
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), strings.NewReader(body))
	if err != nil {
		return errors.New("境彻地址无效")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("本机连接程序无法访问境彻，请检查境彻地址")
	}
	defer resp.Body.Close()
	var result struct {
		Result struct {
			ServerInfo struct{ Name string } `json:"serverInfo"`
		} `json:"result"`
	}
	if resp.StatusCode != 200 || json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result) != nil || result.Result.ServerInfo.Name != "jingche" {
		return errors.New("境彻 MCP 握手失败，请检查后端是否已更新以及连接授权")
	}
	return nil
}

func (d Desktop) RemoveCredential(id string) error {
	err := os.Remove(filepath.Join(d.Home, "integrations", "jingche", id, "connection.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
