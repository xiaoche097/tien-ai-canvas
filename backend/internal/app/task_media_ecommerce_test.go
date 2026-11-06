package app

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestMediaRecoveryEcommerceProjectResumesWithoutGeneration(t *testing.T) {
	for _, source := range []string{"workbench", "ecommerce-agent"} {
		t.Run(source, func(t *testing.T) {
			s, db := newMediaRecoveryTestService(t)
			task := seedMediaTask(t, db, providerConfig{})
			project := model.EcommerceProject{ID: "commerce-project", UserID: task.UserID, Name: "商品", Status: "draft", DraftJSON: "{}", PlanJSON: "{}"}
			if err := db.Create(&project).Error; err != nil {
				t.Fatal(err)
			}
			input, _ := json.Marshal(map[string]any{"mode": "image", "metadata": map[string]any{"source": source, "ecommerceProjectId": project.ID}})
			task.ProjectID, task.InputJSON = project.ID, string(input)
			if err := db.Model(task).Updates(map[string]any{"project_id": task.ProjectID, "input_json": task.InputJSON}).Error; err != nil {
				t.Fatal(err)
			}
			temp, err := s.stageInlineMedia(mediaTestPNG(t))
			if err != nil {
				t.Fatal(err)
			}
			checkpoint := &mediaCheckpoint{Mode: "image", StartedAt: time.Now(), Items: []mediaCheckpointItem{{TempName: temp, MIMEType: "image/png"}}}
			if err := s.saveMediaCheckpoint(task, checkpoint, "register"); err != nil {
				t.Fatal(err)
			}
			if err := db.Model(task).Updates(map[string]any{"status": model.TaskStatusFailed, "lease_owner": "", "lease_expires_at": nil}).Error; err != nil {
				t.Fatal(err)
			}
			if _, err := s.RecoverTaskMedia(task.UserID, task.ID); err != nil {
				t.Fatal(err)
			}
			claimed, err := s.repo.ClaimNextTask("restore-worker", time.Minute)
			if err != nil || claimed == nil {
				t.Fatalf("claim: %v", err)
			}
			// Only staged bytes exist: any new model submission or download fails.
			result, err := s.resumeTaskMedia(context.Background(), claimed)
			if err != nil {
				t.Fatal(err)
			}
			if err := s.finishTaskMediaRecovery(claimed, result, nil); err != nil {
				t.Fatal(err)
			}
			completed, _ := s.repo.Task(task.ID)
			if completed.Status != model.TaskStatusSucceeded {
				t.Fatalf("not delivered: %s", completed.Status)
			}
			if err := s.registerRecoveredMediaAssets(*completed); err != nil {
				t.Fatal(err)
			}
			var assets []model.Asset
			if err := db.Find(&assets).Error; err != nil {
				t.Fatal(err)
			}
			if len(assets) != 1 {
				t.Fatalf("asset count: %d", len(assets))
			}
			var payload struct {
				Metadata map[string]any `json:"metadata"`
			}
			_ = json.Unmarshal([]byte(assets[0].PayloadJSON), &payload)
			if payload.Metadata["ecommerceProjectId"] != project.ID || payload.Metadata["projectIds"] != nil {
				t.Fatal("ecommerce asset linked to wrong project domain")
			}
			var count int64
			db.Model(&model.BillingOrder{}).Count(&count)
			if count != 0 {
				t.Fatal("recovery created a new billing order")
			}
		})
	}
}

func TestMediaRecoveryEcommerceProjectScopeGuards(t *testing.T) {
	s, db := newMediaRecoveryTestService(t)
	project := model.EcommerceProject{ID: "commerce-owned", UserID: "owner", Name: "商品", Status: "draft", DraftJSON: "{}", PlanJSON: "{}"}
	if err := db.Create(&project).Error; err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, user, taskProject, metadataID string
		valid                               bool
	}{
		{"owned", "owner", project.ID, project.ID, true},
		{"metadata-only", "owner", "", project.ID, true},
		{"other-owner", "other", project.ID, project.ID, false},
		{"deleted", "owner", "deleted", "deleted", false},
		{"mismatched", "owner", "another-project", project.ID, false},
		{"untyped-id", "owner", project.ID, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(map[string]any{"metadata": map[string]any{"ecommerceProjectId": tc.metadataID}})
			scope, err := s.mediaTaskProject(&model.Task{UserID: tc.user, ProjectID: tc.taskProject, InputJSON: string(raw)})
			if (err == nil) != tc.valid {
				t.Fatalf("scope accepted=%v, error=%v", err == nil, err)
			}
			if tc.valid && (scope.projectID != "" || scope.ecommerceProjectID != project.ID) {
				t.Fatal("wrong project domain")
			}
		})
	}
}
