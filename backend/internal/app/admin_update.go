package app

import (
	"context"
	"net/http"
	"strings"

	"infinite-canvas/backend/internal/buildinfo"
	"infinite-canvas/backend/internal/hostupdate"
	"infinite-canvas/backend/internal/model"
)

type UpdateManager interface {
	Status(context.Context) (hostupdate.Status, error)
	Check(context.Context) (hostupdate.Status, error)
	Start(context.Context, string) (hostupdate.Status, error)
	Rollback(context.Context, string) (hostupdate.Status, error)
}

func (s *Service) ConfigureUpdateManager(manager UpdateManager) {
	s.updateManager = manager
}

func (s *Service) AdminUpdateStatus(ctx context.Context, actor *model.User) (hostupdate.Status, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return hostupdate.Status{}, err
	}
	if s.updateManager == nil {
		return updaterMissingStatus(), nil
	}
	status, err := s.updateManager.Status(ctx)
	if err != nil {
		return updaterUnreachableStatus("Host Updater 当前不可连接"), nil
	}
	return status, nil
}

func (s *Service) AdminCheckUpdate(ctx context.Context, actor *model.User) (hostupdate.Status, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return hostupdate.Status{}, err
	}
	if s.updateManager == nil {
		return s.checkReleaseWithoutUpdater(ctx)
	}
	status, err := s.updateManager.Check(ctx)
	if err != nil {
		return status, WrapAppError(http.StatusBadGateway, "检查更新失败，请查看更新器状态和日志", err)
	}
	return status, nil
}

// checkReleaseWithoutUpdater 在未安装 Host Updater 时仍查询 GitHub Release，
// 只回报"上游是否发布了更高版本"这一事实；在线更新能力仍然关闭，不返回可执行操作。
func (s *Service) checkReleaseWithoutUpdater(ctx context.Context) (hostupdate.Status, error) {
	status := updaterMissingStatus()
	release, err := s.latestRelease(ctx, hostupdate.DefaultRepository)
	if err != nil {
		return status, WrapAppError(http.StatusBadGateway, "检查更新失败，请检查服务器访问 GitHub 的网络", err)
	}
	status.LatestRelease = release
	status.UpdateAvailable = hostupdate.CompareVersions(status.CurrentVersion, release.Version) < 0
	return status, nil
}

func (s *Service) latestRelease(ctx context.Context, repository string) (*hostupdate.Release, error) {
	if s.releaseLookup != nil {
		return s.releaseLookup(ctx, repository)
	}
	return hostupdate.LatestRelease(ctx, nil, repository, "")
}

func (s *Service) AdminStartUpdate(ctx context.Context, actor *model.User, targetVersion string) (hostupdate.Status, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return hostupdate.Status{}, err
	}
	if s.updateManager == nil {
		return hostupdate.Status{}, NewAppError(http.StatusServiceUnavailable, "当前部署未安装 Host Updater")
	}
	targetVersion = strings.TrimSpace(targetVersion)
	if targetVersion == "" {
		return hostupdate.Status{}, NewAppError(http.StatusBadRequest, "目标版本不能为空")
	}
	status, err := s.updateManager.Start(ctx, targetVersion)
	if err != nil {
		return status, WrapAppError(http.StatusConflict, "无法开始更新，请刷新状态后重试", err)
	}
	return status, nil
}

func (s *Service) AdminRollbackUpdate(ctx context.Context, actor *model.User, reason string) (hostupdate.Status, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return hostupdate.Status{}, err
	}
	if s.updateManager == nil {
		return hostupdate.Status{}, NewAppError(http.StatusServiceUnavailable, "当前部署未安装 Host Updater")
	}
	if strings.TrimSpace(reason) == "" {
		return hostupdate.Status{}, NewAppError(http.StatusBadRequest, "请填写回退原因")
	}
	status, err := s.updateManager.Rollback(ctx, reason)
	if err != nil {
		return status, WrapAppError(http.StatusConflict, "无法开始回退，请检查备份和当前状态", err)
	}
	return status, nil
}

// updaterMissingStatus 表示这套部署本来就没有 Host Updater。它是部署形态而不是故障：
// supported 保持 false，检查项用 unavailable，让管理页不把它渲染成"连接失败"。
// 运行版本和代码仓库与更新器无关，仍从构建信息回填，避免管理页显示"未识别"。
func updaterMissingStatus() hostupdate.Status {
	return updaterOfflineStatus("当前部署未安装 Host Updater")
}

// updaterUnreachableStatus 表示更新器已安装但读不到状态，这是真实故障：
// supported 仍为 true，管理页据此显示错误并提示排查更新器服务与 Socket 挂载。
func updaterUnreachableStatus(detail string) hostupdate.Status {
	status := updaterOfflineStatus(detail)
	status.Supported = true
	status.Deployment = "docker-compose-host-updater"
	return status
}

func updaterOfflineStatus(detail string) hostupdate.Status {
	current := buildinfo.Current().Version
	return hostupdate.Status{
		Supported:      false,
		Connected:      false,
		Repository:     hostupdate.DefaultRepository,
		Deployment:     "unsupported",
		CurrentVersion: current,
		Checks: []hostupdate.Check{
			{Key: "updater", Label: "Host Updater", Status: "unavailable", Detail: detail, Blocking: true},
			{Key: "version", Label: "当前版本", Status: "passed", Detail: current, Blocking: true},
		},
		Operation: hostupdate.Operation{Phase: hostupdate.PhaseIdle, Logs: []hostupdate.LogEntry{}},
	}
}
