// Local desktop bridge for a browser-hosted (including Docker) Jingche workspace.
package main

import (
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"yingce/backend/internal/astravia"
)

func main() {
	origins := flag.String("origins", "http://localhost:3000,http://127.0.0.1:3000", "Allowed local Jingche browser origins, comma separated")
	flag.Parse()
	allowed := map[string]bool{}
	for _, origin := range strings.Split(*origins, ",") {
		if _, err := astravia.LoopbackURL(origin); err != nil {
			fmt.Fprintln(os.Stderr, "Only local HTTP origins are allowed")
			os.Exit(1)
		}
		allowed[origin] = true
	}
	desktop, err := astravia.Local()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Cannot locate Astravia")
		os.Exit(1)
	}
	server := &http.Server{Addr: "127.0.0.1:18765", Handler: connector(desktop, allowed), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 6 * time.Minute}
	fmt.Fprintln(os.Stderr, "Astravia connector listening on 127.0.0.1:18765")
	if err := server.ListenAndServe(); err != nil {
		fmt.Fprintln(os.Stderr, "Connector could not listen; check whether it is already running")
		os.Exit(1)
	}
}

func connector(desktop astravia.Desktop, allowed map[string]bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		nativeStatus := r.Method == "GET" && r.URL.Path == "/connections" && r.Header.Get("Origin") == "" && r.Host == "127.0.0.1:18765" && net.ParseIP(host).IsLoopback()
		if !allowed[r.Header.Get("Origin")] && !nativeStatus {
			http.Error(w, "Origin not allowed", 403)
			return
		}
		if !nativeStatus {
			w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
		}
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		reply := func(status int, value any) { w.WriteHeader(status); _ = json.NewEncoder(w).Encode(value) }
		failure := func(err error) { reply(503, map[string]string{"message": err.Error()}) }
		validID := func(id string) bool { _, err := hex.DecodeString(id); return len(id) == 40 && err == nil }
		switch {
		case r.Method == "GET" && r.URL.Path == "/health":
			reply(200, map[string]string{"name": "jingche-astravia-connector", "version": "1.2.0"})
		case r.Method == "GET" && r.URL.Path == "/connections":
			connections, err := desktop.Connections(r.Context())
			if err != nil {
				failure(err)
				return
			}
			reply(200, map[string]any{"connections": connections})
		case r.Method == "GET" && r.URL.Path == "/status":
			if id := r.URL.Query().Get("id"); id != "" {
				if !validID(id) {
					reply(400, map[string]string{"message": "Invalid connection"})
					return
				}
				status, err := desktop.Status(r.Context(), id, r.URL.Query().Get("endpoint"))
				if err != nil {
					failure(err)
					return
				}
				reply(200, status)
				return
			}
			if err := desktop.Available(r.Context()); err != nil {
				failure(err)
				return
			}
			reply(200, &astravia.ConnectionStatus{Available: true})
		case r.Method == "POST" && r.URL.Path == "/connect":
			r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
			var input struct{ ID, URL, Token string }
			if json.NewDecoder(r.Body).Decode(&input) != nil || !validID(input.ID) || len(input.Token) != 64 {
				reply(400, map[string]string{"message": "Invalid connection"})
				return
			}
			if _, err := astravia.LoopbackURL(input.URL); err != nil {
				reply(400, map[string]string{"message": "Invalid local endpoint"})
				return
			}
			if err := astravia.Probe(r.Context(), input.URL, input.Token); err != nil {
				failure(err)
				return
			}
			if err := desktop.Install(r.Context(), input.ID, input.URL, input.Token); err != nil {
				_ = desktop.RemoveCredential(input.ID)
				failure(err)
				return
			}
			configured, err := desktop.Configured(r.Context(), input.ID)
			if err != nil {
				failure(err)
				return
			}
			if !configured {
				reply(409, map[string]string{"message": "Astravia 未保留境彻配置，请重新连接"})
				return
			}
			status, err := desktop.Status(r.Context(), input.ID, input.URL)
			if err != nil {
				failure(err)
				return
			}
			reply(200, status)
		case r.Method == "POST" && r.URL.Path == "/disconnect":
			r.Body = http.MaxBytesReader(w, r.Body, 1024)
			var input struct{ ID string }
			if json.NewDecoder(r.Body).Decode(&input) != nil || !validID(input.ID) {
				reply(400, map[string]string{"message": "Invalid connection"})
				return
			}
			if err := desktop.RemoveCredential(input.ID); err != nil {
				reply(500, map[string]string{"message": "授权已撤销，本机凭据文件清理失败"})
				return
			}
			reply(200, map[string]bool{"removed": true})
		default:
			w.WriteHeader(404)
		}
	})
}
