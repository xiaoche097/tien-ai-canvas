package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"yingce/backend/internal/astravia"
)

func TestAstraviaHelperOriginAndInputBoundary(t *testing.T) {
	h := connector(astravia.Desktop{Home: t.TempDir()}, map[string]bool{"http://localhost:3000": true})
	for _, tc := range []struct {
		method, path, origin, body string
		status                     int
	}{
		{"GET", "/health", "https://evil.test", "", 403},
		{"GET", "/health", "", "", 403},
		{"GET", "/health", "http://localhost:3000", "", 200},
		{"OPTIONS", "/connect", "http://localhost:3000", "", 204},
		{"POST", "/connect", "http://localhost:3000", `{"id":"../../outside","url":"http://localhost/api","token":"fake"}`, 400},
		{"POST", "/disconnect", "http://localhost:3000", `{"id":"../../outside"}`, 400},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Origin", tc.origin)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != tc.status {
			t.Fatalf("%s %s: got %d", tc.method, tc.path, rec.Code)
		}
	}
}
