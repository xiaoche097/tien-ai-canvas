package app

import (
	"context"
	"errors"
	"testing"

	"infinite-canvas/backend/internal/buildinfo"
	"infinite-canvas/backend/internal/hostupdate"
	"infinite-canvas/backend/internal/model"
)

func TestAdminUpdateStatusRequiresAdmin(t *testing.T) {
	svc := &Service{}
	user := &model.User{ID: "user-1", Role: model.UserRoleUser}

	if _, err := svc.AdminUpdateStatus(context.Background(), user); authStatus(err) != 403 {
		t.Fatalf("AdminUpdateStatus() error = %#v, want 403", err)
	}
	if _, err := svc.AdminUpdateStatus(context.Background(), nil); authStatus(err) != 401 {
		t.Fatalf("AdminUpdateStatus(nil) error = %#v, want 401", err)
	}
}

// 未安装 Host Updater 时仍要回填运行版本和代码仓库，管理页不应显示“未识别”。
func TestAdminUpdateStatusReportsVersionWithoutUpdater(t *testing.T) {
	svc := &Service{}
	admin := &model.User{ID: "admin-1", Role: model.UserRoleAdmin}

	status, err := svc.AdminUpdateStatus(context.Background(), admin)
	if err != nil {
		t.Fatalf("AdminUpdateStatus() error = %#v", err)
	}
	if status.Supported || status.Connected {
		t.Fatalf("unsupported deployment must keep online update disabled: %+v", status)
	}
	want := buildinfo.Current().Version
	if status.CurrentVersion != want {
		t.Fatalf("CurrentVersion = %q, want %q", status.CurrentVersion, want)
	}
	if status.Repository != hostupdate.DefaultRepository {
		t.Fatalf("Repository = %q, want %q", status.Repository, hostupdate.DefaultRepository)
	}

	version := findUpdateCheck(status.Checks, "version")
	if version == nil {
		t.Fatalf("checks must report the running version: %+v", status.Checks)
	}
	if version.Status != "passed" || version.Detail != want {
		t.Fatalf("version check = %+v, want passed %q", version, want)
	}
	updater := findUpdateCheck(status.Checks, "updater")
	if updater == nil || updater.Status != "unavailable" || !updater.Blocking {
		t.Fatalf("updater check = %+v, want a blocking unavailable entry", updater)
	}
	if status.Supported {
		t.Fatal("a deployment without Host Updater must not report supported")
	}
}

// 装了更新器却读不到状态是真实故障：supported 仍为 true，管理页据此报错。
func TestAdminUpdateStatusReportsUnreachableUpdater(t *testing.T) {
	svc := &Service{}
	admin := &model.User{ID: "admin-1", Role: model.UserRoleAdmin}
	svc.updateManager = &fakeUpdateManager{statusErr: errors.New("dial unix socket: no such file")}

	status, err := svc.AdminUpdateStatus(context.Background(), admin)
	if err != nil {
		t.Fatalf("AdminUpdateStatus() error = %#v", err)
	}
	if !status.Supported || status.Connected {
		t.Fatalf("installed-but-unreachable must stay supported and disconnected: %+v", status)
	}
	if status.Deployment != "docker-compose-host-updater" {
		t.Fatalf("Deployment = %q, want docker-compose-host-updater", status.Deployment)
	}
	updater := findUpdateCheck(status.Checks, "updater")
	if updater == nil || updater.Status != "unavailable" || !updater.Blocking {
		t.Fatalf("updater check = %+v, want a blocking unavailable entry", updater)
	}
}

type fakeUpdateManager struct {
	statusErr error
}

func (f *fakeUpdateManager) Status(context.Context) (hostupdate.Status, error) {
	return hostupdate.Status{}, f.statusErr
}

func (f *fakeUpdateManager) Check(context.Context) (hostupdate.Status, error) {
	return hostupdate.Status{}, f.statusErr
}

func (f *fakeUpdateManager) Start(context.Context, string) (hostupdate.Status, error) {
	return hostupdate.Status{}, f.statusErr
}

func (f *fakeUpdateManager) Rollback(context.Context, string) (hostupdate.Status, error) {
	return hostupdate.Status{}, f.statusErr
}

func findUpdateCheck(checks []hostupdate.Check, key string) *hostupdate.Check {
	for i := range checks {
		if checks[i].Key == key {
			return &checks[i]
		}
	}
	return nil
}

// 未安装 Host Updater 时仍要查到最新发布，但在线更新能力必须保持关闭。
func TestAdminCheckUpdateReadsReleaseWithoutUpdater(t *testing.T) {
	admin := &model.User{ID: "admin-1", Role: model.UserRoleAdmin}
	release := &hostupdate.Release{Version: "v99.0.0", Name: "v99.0.0"}

	t.Run("reports newer release", func(t *testing.T) {
		svc := &Service{}
		svc.releaseLookup = func(context.Context, string) (*hostupdate.Release, error) { return release, nil }

		status, err := svc.AdminCheckUpdate(context.Background(), admin)
		if err != nil {
			t.Fatalf("AdminCheckUpdate() error = %#v", err)
		}
		if status.LatestRelease == nil || status.LatestRelease.Version != release.Version {
			t.Fatalf("LatestRelease = %+v, want %s", status.LatestRelease, release.Version)
		}
		if !status.UpdateAvailable {
			t.Fatal("UpdateAvailable = false, want true for a higher upstream release")
		}
		if status.Supported || status.Connected {
			t.Fatalf("read-only check must not enable online update: %+v", status)
		}
		if status.Operation.Phase != hostupdate.PhaseIdle {
			t.Fatalf("Operation.Phase = %q, want idle", status.Operation.Phase)
		}
	})

	t.Run("no newer release", func(t *testing.T) {
		svc := &Service{}
		svc.releaseLookup = func(context.Context, string) (*hostupdate.Release, error) {
			return &hostupdate.Release{Version: buildinfo.Current().Version}, nil
		}

		status, err := svc.AdminCheckUpdate(context.Background(), admin)
		if err != nil {
			t.Fatalf("AdminCheckUpdate() error = %#v", err)
		}
		if status.UpdateAvailable {
			t.Fatal("UpdateAvailable = true for the same version")
		}
	})

	t.Run("lookup failure surfaces as error", func(t *testing.T) {
		svc := &Service{}
		svc.releaseLookup = func(context.Context, string) (*hostupdate.Release, error) {
			return nil, errors.New("no route to host")
		}

		status, err := svc.AdminCheckUpdate(context.Background(), admin)
		if err == nil {
			t.Fatalf("AdminCheckUpdate() error = nil, want a lookup failure")
		}
		if status.CurrentVersion != buildinfo.Current().Version {
			t.Fatalf("failed check must still report the running version, got %+v", status)
		}
		if status.Supported || status.Connected {
			t.Fatalf("failed check must not enable online update: %+v", status)
		}
	})
}
