param(
    [string]$Origins = 'http://localhost:3000,http://127.0.0.1:3000',
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
$taskName = 'Jingche-Astravia-Connector'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$installationRoot = Join-Path $env:LOCALAPPDATA 'Jingche/AstraviaConnector'
$guardPath = Join-Path $installationRoot 'guard-astravia-connector.ps1'
$launcherPath = Join-Path $installationRoot 'astravia-guardian.exe'
$executable = Join-Path $installationRoot 'astravia-connector.exe'
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and -not (@($existingTask.Actions | Where-Object { $_.Execute -eq $launcherPath -or $_.Arguments -like ('*"' + $guardPath + '"*') }).Count)) {
    throw 'An unrelated scheduled task uses this name; nothing changed'
}
function Stop-ManagedGuardian {
    if ($existingTask) {
        Disable-ScheduledTask -TaskName $taskName | Out-Null
        Stop-ScheduledTask -TaskName $taskName
        for ($attempt=0; $attempt -lt 20 -and (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'; $attempt++) { Start-Sleep -Milliseconds 200 }
        if ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { throw 'Existing guardian did not stop; installation unchanged' }
    }
    # Stopping a scheduled GUI launcher can leave its no-console child alive.
    $escapedGuard = [Regex]::Escape($guardPath)
    $guardPattern = '(?i)(?:^|\s)-File\s+(?:"' + $escapedGuard + '"|' + $escapedGuard + ')(?=\s|$)'
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -match $guardPattern } | ForEach-Object {
        Stop-Process -Id $_.ProcessId
        Wait-Process -Id $_.ProcessId -Timeout 5 -ErrorAction SilentlyContinue
    }
}
if ($Uninstall) {
    Stop-ManagedGuardian
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Get-Process -Name 'astravia-connector' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable } | Stop-Process
    Write-Output 'Automatic connector startup disabled; canvas authorizations were not changed.'
    return
}
$normalizedOrigins = @()
foreach ($origin in $Origins.Split(',')) {
    $uri = $null
    if (-not [Uri]::TryCreate($origin.Trim(),[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'http' -or $uri.Host -notin @('localhost','127.0.0.1','[::1]','::1') -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne '/') { throw 'Only literal local HTTP origins are allowed' }
    $normalizedOrigins += $uri.GetLeftPart([UriPartial]::Authority)
}
$Origins = $normalizedOrigins -join ','
$cacheDirectory = Join-Path $workspaceRoot '.local/cache/astravia-connector'
New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null
$builtExecutable = Join-Path $cacheDirectory 'astravia-connector.install.exe'
$builtLauncher = Join-Path $cacheDirectory 'astravia-guardian.install.exe'
Push-Location (Join-Path $workspaceRoot 'backend')
try {
    & go build -buildvcs=false -ldflags '-H=windowsgui' -o $builtExecutable ./cmd/astravia-connector
    if ($LASTEXITCODE -ne 0) { throw 'Connector build failed; existing installation preserved' }
    & go build -buildvcs=false -ldflags '-H=windowsgui' -o $builtLauncher ./cmd/astravia-guardian
    if ($LASTEXITCODE -ne 0) { throw 'Guardian launcher build failed; existing installation preserved' }
} finally { Pop-Location }
Stop-ManagedGuardian
New-Item -ItemType Directory -Path $installationRoot -Force | Out-Null
$candidate = Join-Path $installationRoot 'astravia-connector.next.exe'
Copy-Item -LiteralPath $builtExecutable -Destination $candidate -Force
Get-Process -Name 'astravia-connector' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable } | ForEach-Object {
    Stop-Process -Id $_.Id
    Wait-Process -Id $_.Id -Timeout 5 -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath $executable) {
    [IO.File]::Replace($candidate, $executable, (Join-Path $installationRoot 'astravia-connector.previous.exe'))
} else {
    [IO.File]::Move($candidate, $executable)
}
Remove-Item -LiteralPath $builtExecutable
Get-Process -Name 'astravia-guardian' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $launcherPath } | ForEach-Object {
    Stop-Process -Id $_.Id
    Wait-Process -Id $_.Id -Timeout 5 -ErrorAction SilentlyContinue
}
$launcherCandidate = Join-Path $installationRoot 'astravia-guardian.next.exe'
Copy-Item -LiteralPath $builtLauncher -Destination $launcherCandidate -Force
if (Test-Path -LiteralPath $launcherPath) {
    [IO.File]::Replace($launcherCandidate, $launcherPath, (Join-Path $installationRoot 'astravia-guardian.previous.exe'))
} else {
    [IO.File]::Move($launcherCandidate, $launcherPath)
}
Remove-Item -LiteralPath $builtLauncher
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'guard-astravia-connector.ps1') -Destination $guardPath -Force
$configuration = @{origins=$Origins; legacyExecutable=(Join-Path $workspaceRoot '.local/cache/astravia-connector/astravia-connector.exe')}
[IO.File]::WriteAllText((Join-Path $installationRoot 'guardian.json'), ($configuration | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$action = New-ScheduledTaskAction -Execute $launcherPath
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
$retry = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $identity.User.Value -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon,$retry) -Settings $settings -Principal $principal -Description 'Jingche Astravia local connector guardian; current user only; no model calls or permission renewal.' -Force | Out-Null
Enable-ScheduledTask -TaskName $taskName | Out-Null
Start-ScheduledTask -TaskName $taskName
$ready = $false
for ($attempt=0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $health=Invoke-RestMethod 'http://127.0.0.1:18765/health' -Headers @{Origin=$normalizedOrigins[0]} -TimeoutSec 1
        $guardianState=Get-Content -LiteralPath (Join-Path $installationRoot 'guardian-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $guardProcess=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $guardianState.pid)
        $guardParent=if ($guardProcess) { Get-Process -Id $guardProcess.ParentProcessId -ErrorAction SilentlyContinue } else { $null }
        if ($health.name -eq 'jingche-astravia-connector' -and $guardianState.state -eq 'ready' -and $guardParent.Path -eq $launcherPath -and (Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { $ready=$true; break }
    } catch { }
}
if (-not $ready) { throw 'Guardian registered but connector is not ready; inspect guardian-state.json' }
Write-Output 'Connector installed in LocalAppData; login startup and automatic recovery enabled for the current user.'
