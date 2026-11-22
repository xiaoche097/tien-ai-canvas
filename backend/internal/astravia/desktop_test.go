package astravia

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestAstraviaLoopbackBoundary(t *testing.T) {
	for _, raw := range []string{"https://localhost:3000/api", "http://localhost.evil.test/api", "http://192.168.1.1/api", "http://user:password@localhost/api", "http://localhost/api?token=fake", "http://localhost/api#fragment", "file:///tmp/rpc"} {
		if _, err := LoopbackURL(raw); err == nil {
			t.Fatal("accepted unsafe endpoint")
		}
	}
	for _, raw := range []string{"http://127.0.0.1:3000/api", "http://localhost:3000/api", "http://[::1]:3000/api"} {
		if _, err := LoopbackURL(raw); err != nil {
			t.Fatal(err)
		}
	}
}

func TestAstraviaRenamedDefaultStdioConnectionAndHandshake(t *testing.T) {
	home := t.TempDir()
	id := strings.Repeat("c", 40)
	dir := filepath.Join(home, "integrations", "jingche", id)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	var unavailable atomic.Bool
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if unavailable.Load() {
			w.WriteHeader(401)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"serverInfo": map[string]string{"name": "jingche"}}})
	}))
	defer backend.Close()
	endpoint := backend.URL + "/api/integrations/astravia/mcp/" + id
	credential, _ := json.Marshal(map[string]string{"url": endpoint, "token": strings.Repeat("a", 64)})
	if err := os.WriteFile(filepath.Join(dir, "connection.json"), credential, 0600); err != nil {
		t.Fatal(err)
	}
	var mutations atomic.Int32
	desktop := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			ID, Method string
			Params     struct{ Input struct{ Operation string } }
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			t.Error("invalid RPC")
			return
		}
		var result any = []map[string]string{{"id": "mcp.manage"}}
		if req.Method == "actions.run" {
			switch req.Params.Input.Operation {
			case "list":
				result = map[string]any{"servers": []map[string]string{{"name": "境彻"}}}
			case "get":
				result = map[string]any{"command": "node", "args": []string{filepath.Join(dir, "bridge.mjs"), filepath.Join(dir, "connection.json")}}
			default:
				mutations.Add(1)
				result = map[string]string{"operation": "upsert"}
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": req.ID, "ok": true, "result": result})
	}))
	defer desktop.Close()
	data, _ := json.Marshal(map[string]string{"transport": "http", "url": desktop.URL, "token": "TEST_ONLY_DESKTOP_TOKEN"})
	_ = os.WriteFile(filepath.Join(home, "action-server.json"), data, 0600)
	d := Desktop{Home: home}
	status, err := d.Status(context.Background(), id, endpoint)
	if err != nil || !status.Configured || !status.Ready || status.Connected || status.ServerName != "境彻" {
		t.Fatal("renamed stdio server not recognized")
	}
	heartbeat, _ := json.Marshal(map[string]any{"connected": true, "origin": backend.URL, "lastSeenAt": time.Now().UTC()})
	_ = os.WriteFile(filepath.Join(dir, "runtime-123.json"), heartbeat, 0600)
	status, err = d.Status(context.Background(), id, endpoint)
	if err != nil || !status.Connected {
		t.Fatal("live Agent session heartbeat not recognized")
	}
	status, err = d.Status(context.Background(), id, "http://localhost:9999/other")
	if err != nil || status.Connected {
		t.Fatal("different workspace entry reported connected")
	}
	unavailable.Store(true)
	status, err = d.Status(context.Background(), id, endpoint)
	if err != nil || !status.Configured || status.Connected {
		t.Fatal("invalid credential or backend failure reported connected")
	}
	if _, err := exec.LookPath("node"); err == nil {
		if err := d.Install(context.Background(), id, endpoint, strings.Repeat("a", 64)); err != nil {
			t.Fatal(err)
		}
		if mutations.Load() != 0 {
			t.Fatal("reusing an existing server caused another desktop approval")
		}
	}
}

func TestAstraviaDesktopApprovalAndCredentialIsolation(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("Node not installed")
	}
	home := t.TempDir()
	const fakeToken = "test-only-not-a-real-credential"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+fakeToken {
			t.Error("missing desktop auth")
		}
		var req struct {
			ID, Method string
			Params     struct {
				ActionID string `json:"actionId"`
				Input    map[string]any
			}
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			t.Error("invalid RPC")
			return
		}
		result := any([]map[string]string{{"id": "mcp.manage"}})
		if req.Method == "actions.run" {
			encoded, _ := json.Marshal(req.Params.Input)
			if strings.Contains(string(encoded), fakeToken) {
				t.Error("credential leaked to RPC arguments")
			}
			result = map[string]string{"operation": "upsert"}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"id": req.ID, "ok": true, "result": result})
	}))
	defer server.Close()
	data, _ := json.Marshal(map[string]string{"transport": "http", "url": server.URL, "token": fakeToken})
	if err := os.WriteFile(filepath.Join(home, "action-server.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	d := Desktop{Home: home}
	if err := d.Available(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := d.Install(context.Background(), "test-connection", server.URL+"/mcp", fakeToken); err != nil {
		t.Fatal(err)
	}
	if err := d.RemoveCredential("test-connection"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(home, "integrations", "jingche", "test-connection", "connection.json")); !os.IsNotExist(err) {
		t.Fatal("credential not removed")
	}
}

func TestAstraviaBridgeRealJSONLHandshake(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node not installed")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-only" {
			t.Error("missing bridge auth")
		}
		var req struct {
			ID     any
			Method string
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			t.Error("invalid JSON")
			return
		}
		if req.ID == nil {
			w.WriteHeader(202)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": map[string]any{"protocolVersion": "2025-06-18", "serverInfo": map[string]string{"name": "jingche"}}})
	}))
	defer server.Close()
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "bridge.mjs"), bridge, 0600)
	config, _ := json.Marshal(map[string]string{"url": server.URL, "token": "test-only"})
	_ = os.WriteFile(filepath.Join(dir, "connection.json"), config, 0600)
	cmd := exec.Command(node, filepath.Join(dir, "bridge.mjs"), filepath.Join(dir, "connection.json"))
	cmd.Stdin = strings.NewReader("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n")
	out, err := cmd.Output()
	if err != nil {
		t.Fatal("bridge process failed")
	}
	var response struct {
		ID     int
		Result struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
	}
	if json.Unmarshal(out, &response) != nil || response.ID != 1 || response.Result.ProtocolVersion != "2025-06-18" {
		t.Fatal("invalid MCP handshake")
	}
	if strings.Contains(string(out), "test-only") {
		t.Fatal("credential in protocol output")
	}
}

func TestAstraviaRunningBridgeReloadsRotatedCredential(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node not installed")
	}
	var expected atomic.Value
	expected.Store("TEST_ONLY_FIRST_TOKEN")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+expected.Load().(string) {
			w.WriteHeader(401)
			return
		}
		var req struct {
			ID     any
			Method string
		}
		if json.NewDecoder(r.Body).Decode(&req) != nil {
			t.Error("invalid JSONL request")
			return
		}
		result := map[string]any{}
		if req.Method == "initialize" {
			result = map[string]any{"protocolVersion": "2025-06-18", "serverInfo": map[string]string{"name": "jingche"}}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": result})
	}))
	defer server.Close()
	dir := t.TempDir()
	configPath := filepath.Join(dir, "connection.json")
	writeCredential := func(token string) {
		data, _ := json.Marshal(map[string]string{"url": server.URL, "token": token})
		if err := os.WriteFile(configPath, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	writeCredential("TEST_ONLY_FIRST_TOKEN")
	_ = os.WriteFile(filepath.Join(dir, "bridge.mjs"), bridge, 0600)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, node, filepath.Join(dir, "bridge.mjs"), configPath)
	input, _ := cmd.StdinPipe()
	output, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		t.Fatal("cannot start bridge")
	}
	defer func() { _ = input.Close(); _ = cmd.Process.Kill() }()
	reader := bufio.NewReader(output)
	request := func(method string, id int) {
		body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method})
		_, _ = fmt.Fprintln(input, string(body))
		line, err := reader.ReadBytes('\n')
		if err != nil {
			t.Fatal("running bridge stopped responding")
		}
		var response struct{ Error json.RawMessage }
		if json.Unmarshal(line, &response) != nil || len(response.Error) > 0 {
			t.Fatal("running bridge rejected current credential")
		}
	}
	request("initialize", 1)
	runtimePath := filepath.Join(dir, fmt.Sprintf("runtime-%d.json", cmd.Process.Pid))
	if _, err := os.Stat(runtimePath); err != nil {
		t.Fatal("live bridge heartbeat missing")
	}
	expected.Store("TEST_ONLY_ROTATED_TOKEN")
	writeCredential("TEST_ONLY_ROTATED_TOKEN")
	request("ping", 2)
	_ = input.Close()
	if err := cmd.Wait(); err != nil {
		t.Fatal("bridge did not shut down cleanly")
	}
	if _, err := os.Stat(runtimePath); !os.IsNotExist(err) {
		t.Fatal("closed test client left an active Agent heartbeat")
	}
}
