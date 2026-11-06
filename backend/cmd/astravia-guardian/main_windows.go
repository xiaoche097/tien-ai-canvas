//go:build windows

// GUI-subsystem entry for Task Scheduler; the guard must never allocate a console.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func main() {
	executable, err := os.Executable()
	if err != nil {
		os.Exit(1)
	}
	root := filepath.Dir(executable)
	guard := filepath.Join(root, "guard-astravia-connector.ps1")
	if _, err := os.Stat(guard); err != nil {
		os.Exit(1)
	}
	systemRoot := os.Getenv("SystemRoot")
	if systemRoot == "" {
		os.Exit(1)
	}
	powershell := filepath.Join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
	command := exec.Command(powershell, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", guard)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	logPath := filepath.Join(root, "guardian-launcher.log")
	if info, err := os.Stat(logPath); err == nil && info.Size() > 1<<20 {
		_ = os.Rename(logPath, logPath+".previous")
	}
	log, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		os.Exit(1)
	}
	defer log.Close()
	command.Stdout, command.Stderr = log, log
	if err := command.Run(); err != nil {
		os.Exit(1)
	}
}
