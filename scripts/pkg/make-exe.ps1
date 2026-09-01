# Gelectron Windows installer builder (NSIS)
#
# Stages the payload and compiles the installer EXE with makensis:
#   Gelectron-<version>-<arch>.exe
#
# Usage:
#   powershell -File scripts/pkg/make-exe.ps1 `
#     -Bin target\release\gelectron.exe `
#     -Compat src\electron `
#     -Version 0.1.1 -Arch x64 -Out dist
#
# Requires makensis on PATH (install via: choco install nsis -y)

param(
    [Parameter(Mandatory = $true)][string]$Bin,
    [Parameter(Mandatory = $true)][string]$Compat,
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Arch = "x64",
    [string]$Out = "dist",
    [string]$NsiPath = "scripts/pkg/gelectron.nsi"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command makensis -ErrorAction SilentlyContinue)) {
    throw "makensis not found. Install NSIS first (choco install nsis -y)."
}

$RealityVersion = $Version.TrimStart("v")

$Stage = Join-Path $env:TEMP ("gelectron-nsis-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Stage -Force | Out-Null
try {
    Copy-Item $Bin (Join-Path $Stage "gelectron.exe") -Force
    Copy-Item -Recurse -Force $Compat (Join-Path $Stage "compat")
    Copy-Item $NsiPath (Join-Path $Stage "gelectron.nsi") -Force

    Write-Host "==> Compiling installer (makensis)..."
    Push-Location $Stage
    try {
        & makensis "-DVERSION=$RealityVersion" "-DARCH=$Arch" gelectron.nsi
        if ($LASTEXITCODE -ne 0) { throw "makensis failed with exit code $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }

    $Installer = Get-ChildItem $Stage -Filter "Gelectron-*.exe" | Select-Object -First 1
    if (-not $Installer) { throw "makensis produced no installer" }

    New-Item -ItemType Directory -Path $Out -Force | Out-Null
    Copy-Item $Installer.FullName (Join-Path $Out $Installer.Name) -Force
    Write-Host ""
    Write-Host "==> Created installer: $(Join-Path $Out $Installer.Name)"
}
finally {
    Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
}