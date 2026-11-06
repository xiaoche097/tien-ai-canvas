param([string]$Origins = 'http://localhost:3000,http://127.0.0.1:3000')
$ErrorActionPreference = 'Stop'
try {
    $allOriginsReady = $true
    foreach ($origin in $Origins.Split(',')) {
        $connectorHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:18765/health' -Headers @{ Origin = $origin } -TimeoutSec 2
        if ($connectorHealth.name -ne 'jingche-astravia-connector' -or $connectorHealth.version -ne '1.2.0') { $allOriginsReady = $false }
    }
    if ($allOriginsReady) {
        Write-Output 'Astravia 连接程序已在运行。'
        return
    }
} catch { }
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $workspaceRoot '.local/cache/astravia-connector'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$connectorExecutable = Join-Path $outputDirectory 'astravia-connector.exe'
$candidateExecutable = Join-Path $outputDirectory 'astravia-connector.next.exe'
Push-Location (Join-Path $workspaceRoot 'backend')
try {
    & go build -buildvcs=false -ldflags '-H=windowsgui' -o $candidateExecutable ./cmd/astravia-connector
    if ($LASTEXITCODE -ne 0) { throw 'Astravia connector build failed' }
} finally { Pop-Location }
$listeners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 18765 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    $existingProcess = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
    if ($existingProcess.Path -ne $connectorExecutable -and $existingProcess.Path -ne $candidateExecutable) {
        throw '18765 端口被其他程序占用，未停止该程序。'
    }
    Stop-Process -Id $existingProcess.Id
    Wait-Process -Id $existingProcess.Id -Timeout 5 -ErrorAction SilentlyContinue
}
Move-Item -LiteralPath $candidateExecutable -Destination $connectorExecutable -Force
$connectorProcess = Start-Process -FilePath $connectorExecutable -ArgumentList @('-origins', $Origins) -WindowStyle Hidden -PassThru
$connectorReady = $false
for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Milliseconds 300
    if ($connectorProcess.HasExited) { throw '本机连接程序启动失败，请检查 18765 端口是否已被占用。' }
    try {
        foreach ($origin in $Origins.Split(',')) {
            $connectorHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:18765/health' -Headers @{ Origin = $origin } -TimeoutSec 2
            if ($connectorHealth.name -ne 'jingche-astravia-connector' -or $connectorHealth.version -ne '1.2.0') { throw 'Unexpected connector response' }
        }
        $connectorReady = $true
        break
    } catch { }
}
if (-not $connectorReady) { throw '本机连接程序尚不可访问，未确认启动成功。' }
Write-Output 'Astravia 连接程序已启动，已有授权会由画布自动检查。登录自启请运行 scripts/install-astravia-connector.ps1。'
