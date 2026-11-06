$ErrorActionPreference = 'Stop'
$installationRoot = $PSScriptRoot
$configuration = Get-Content -LiteralPath (Join-Path $installationRoot 'guardian.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$executable = Join-Path $installationRoot 'astravia-connector.exe'
$allowedExecutables = @($executable, $configuration.legacyExecutable)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex = [Threading.Mutex]::new($false, ('Local\JingcheAstraviaGuardian-' + $identity))
$acquired = $false
$previousState = ''
$retrySeconds = 2

function Write-GuardianState([string]$State) {
    $record = @{ state = $State; checkedAt = [DateTime]::UtcNow.ToString('o'); pid = $PID }
    [IO.File]::WriteAllText((Join-Path $installationRoot 'guardian-state.json'), ($record | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
    if ($script:previousState -ne $State) {
        $log = Join-Path $installationRoot 'guardian.log'
        if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1MB) {
            Move-Item -LiteralPath $log -Destination ($log + '.previous') -Force
        }
        [IO.File]::AppendAllText($log, ([DateTime]::UtcNow.ToString('o') + ' ' + $State + [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
        $script:previousState = $State
    }
}

try {
    try { $acquired = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) { exit 0 }
    while ($true) {
        try {
            $listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 18765 -State Listen -ErrorAction SilentlyContinue)
            $owners = @()
            $conflict = $false
            foreach ($listener in $listeners) {
                $owner = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
                if (-not $owner) { continue }
                if (-not $owner.Path -or $allowedExecutables -notcontains $owner.Path) { $conflict = $true; break }
                $owners += $owner
            }
            if ($conflict) {
                Write-GuardianState 'port_conflict'
                Start-Sleep -Seconds 10
                continue
            }
            $healthy = $false
            if ($owners.Count -gt 0) {
                try {
                    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:18765/health' -Headers @{Origin=$configuration.origins.Split(',')[0]} -TimeoutSec 2
                    $healthy = $health.name -eq 'jingche-astravia-connector'
                } catch { }
            }
            if ($healthy) {
                Write-GuardianState 'ready'
                $retrySeconds = 2
                Start-Sleep -Seconds 3
                continue
            }
            foreach ($owner in $owners) {
                Stop-Process -Id $owner.Id -ErrorAction SilentlyContinue
                Wait-Process -Id $owner.Id -Timeout 3 -ErrorAction SilentlyContinue
            }
            if (-not (Test-Path -LiteralPath $executable)) { throw 'Managed executable missing' }
            Write-GuardianState 'recovering'
            $child = Start-Process -FilePath $executable -ArgumentList @('-origins', $configuration.origins) -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $installationRoot 'connector.log')
            Start-Sleep -Seconds 1
            if ($child.HasExited) { throw 'Managed connector exited' }
        } catch {
            Write-GuardianState 'retrying'
            Start-Sleep -Seconds $retrySeconds
            $retrySeconds = [Math]::Min(30, $retrySeconds * 2)
        }
    }
} finally {
    if ($acquired) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
