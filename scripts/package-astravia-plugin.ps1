$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $workspaceRoot 'integrations/astravia'
Push-Location $pluginRoot
try {
    & bun run build
    if ($LASTEXITCODE -ne 0) { throw 'Astravia status plugin build failed' }
} finally { Pop-Location }
$packageRoot = Join-Path $workspaceRoot '.local/cache/astravia-plugin'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$staging = Join-Path $packageRoot ('package-' + $stamp)
New-Item -ItemType Directory -Force -Path $staging | Out-Null
foreach ($entry in @('plugin.json','icon.svg','dist')) {
    Copy-Item -LiteralPath (Join-Path $pluginRoot $entry) -Destination $staging -Recurse
}
$archive = Join-Path $packageRoot ('jingche-connection-' + $stamp + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($staging,$archive)
[IO.File]::WriteAllText((Join-Path $packageRoot 'latest-package.txt'), $archive, [Text.UTF8Encoding]::new($false))
Write-Output 'Astravia status plugin packaged; manifest requests input-bar UI and local status access only.'
