# gelectron installer (PowerShell / Windows)
#
# Downloads the pre-built gelectron binary + Electron compatibility layer from
# GitHub Releases and installs it into PREFIX so `gelectron <app>` works from
# anywhere. No Rust toolchain or npm required.
#
#   Install layout:
#     <PREFIX>/gelectron.exe      native binary
#     <PREFIX>/compat/*.js        Electron API compat layer
#
# Usage:
#   .\scripts\install-release.ps1                 latest release
#   .\scripts\install-release.ps1 -Version v0.1.1
#   .\scripts\install-release.ps1 -File C:\path\to\gelectron-0.1.1-win32-x64.zip
#   .\scripts\install-release.ps1 -Prefix "$HOME\bin"
#   .\scripts\install-release.ps1 -Uninstall

param(
    [string]$Repo = "mileswolfallen2/gelectron",
    [string]$Prefix = "",
    [string]$Version = "",
    [string]$File = "",
    [switch]$Uninstall,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
    @"
  gelectron installer - install pre-built gelectron from GitHub Releases

  Usage:
    install-release.ps1 [options]

  Options:
    -Repo owner/repo    GitHub repo (default: mileswolfallen2/gelectron)
    -Prefix DIR         Install directory (default: %LOCALAPPDATA%\gelectron\bin)
    -Version TAG        Install a specific release tag (default: latest)
    -File PATH          Install from a local archive instead of downloading
    -Uninstall          Remove previously installed files
    -Help               Show this help
"@ | Write-Host
}

if ($Help) { Show-Help; exit 0 }
if (-not $Prefix) { $Prefix = Join-Path $env:LOCALAPPDATA "gelectron\bin" }

# ── Detect platform / arch ──────────────────────────────────────────────────

$Platform = "win32"
switch ($env:PROCESSOR_ARCHITECTURE) {
    "ARM64" { $Arch = "arm64" }
    default { $Arch = "x64" }
}
$ArchiveExt = "zip"

# ── Uninstall ───────────────────────────────────────────────────────────────

if ($Uninstall) {
    foreach ($p in @((Join-Path $Prefix "gelectron.exe"), (Join-Path $Prefix "compat"))) {
        if (Test-Path $p) { Remove-Item -Recurse -Force $p }
    }
    Write-Host "Removed $Prefix\gelectron.exe and $Prefix\compat"
    exit 0
}

# ── Resolve version + archive ───────────────────────────────────────────────

$ArchiveFile = $File
if (-not $ArchiveFile) {
    if ($Version) {
        $Tag = "v" + ($Version.TrimStart("v"))
    } else {
        Write-Host "==> Resolving latest release from $Repo..."
        $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "gelectron-installer" }
        $Tag = $latest.tag_name
    }
    $Ver = $Tag.TrimStart("v")
    $Asset = "gelectron-$Ver-$Platform-$Arch.$ArchiveExt"
    $Url = "https://github.com/$Repo/releases/download/$Tag/$Asset"
    Write-Host "==> Downloading $Asset ..."
    $ArchiveFile = Join-Path $env:TEMP "gelectron-install-$([Guid]::NewGuid().ToString('N')).$ArchiveExt"
    Invoke-WebRequest -Uri $Url -OutFile $ArchiveFile -UseBasicParsing
}

# ── Extract ─────────────────────────────────────────────────────────────────

$Stage = Join-Path $env:TEMP ("gelectron-install-stage-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $Stage | Out-Null
try {
    Write-Host "==> Extracting archive..."
    Expand-Archive -Path $ArchiveFile -DestinationPath $Stage -Force

    $Bin = Join-Path $Stage "gelectron.exe"
    if (-not (Test-Path $Bin)) {
        throw "archive does not contain gelectron.exe"
    }

    # ── Install ─────────────────────────────────────────────────────────────

    Write-Host "==> Installing to $Prefix"
    New-Item -ItemType Directory -Path $Prefix -Force | Out-Null
    Copy-Item $Bin (Join-Path $Prefix "gelectron.exe") -Force
    if (Test-Path (Join-Path $Stage "compat")) {
        Copy-Item -Recurse -Force (Join-Path $Stage "compat") $Prefix
    }

    Write-Host ""
    Write-Host "  OK Installed: $Prefix\gelectron.exe"
    Write-Host "  OK Installed: $Prefix\compat\"
    Write-Host ""
    Write-Host "  Add $Prefix to your PATH, then run:"
    Write-Host '    gelectron C:\path\to\electron-app'
}
finally {
    Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue
    if (-not $File) { Remove-Item -Force $ArchiveFile -ErrorAction SilentlyContinue }
}