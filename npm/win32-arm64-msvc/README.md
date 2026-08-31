# Gelectron (Windows ARM64)

Gelectron native addon for **Windows on ARM64**.

This package provides the native `gelectron_core` binary for Windows ARM64. It is an internal dependency of [`gelectron`](https://www.npmjs.com/package/gelectron) and is installed automatically — you should not need to install it directly.

> Gelectron is a drop-in replacement for Electron using native web views (WKWebView / WebView2 / WebKitGTK) instead of Chromium.

## Usage

Install the platform-specific addon for your system:

```bash
npm install gelectron
```

The correct platform binary is selected automatically via `optionalDependencies`.
