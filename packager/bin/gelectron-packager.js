#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

const NODE_VERSION = '20.18.1';

const PLATFORMS = {
  darwin: { arch: { arm64: 'darwin-arm64', x64: 'darwin-x64' }, exe: null, nodeExe: 'bin/node', framework: 'app' },
  win32: { arch: { x64: 'win32-x64', arm64: 'win32-arm64' }, exe: '.exe', nodeExe: 'node.exe', framework: 'app' },
  linux: { arch: { x64: 'linux-x64', arm64: 'linux-arm64' }, exe: null, nodeExe: 'bin/node', framework: 'app' },
};

function log(msg) { console.log(`  ${msg}`); }
function die(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = ((downloaded / total) * 100).toFixed(0);
          process.stdout.write(`\r    Downloading... ${pct}%`);
        }
      });
      res.pipe(file);
      file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(); });
    }).on('error', (err) => { fs.unlinkSync(dest); reject(err); });
  });
}

function extractTarGz(archive, dest) {
  execSync(`tar -xzf "${archive}" -C "${dest}"`, { stdio: 'pipe' });
}

function extractZip(archive, dest) {
  execSync(`unzip -o "${archive}" -d "${dest}"`, { stdio: 'pipe' });
}

function findGelectronBinary(projectRoot) {
  const candidates = [
    path.join(projectRoot, 'target', 'release', 'gelectron'),
    path.join(projectRoot, 'target', 'debug', 'gelectron'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findCompatLayer(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const p = path.join(dir, 'src', 'electron');
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

function findGelectronFromAncestors(appDir) {
  let dir = appDir;
  while (dir !== path.dirname(dir)) {
    // Check for Cargo workspace root (has target/release/gelectron)
    const bin = findGelectronBinary(dir);
    if (bin) return bin;
    // Check for gelectron npm package in node_modules
    const p = path.join(dir, 'node_modules', 'gelectron');
    if (fs.existsSync(p)) {
      const bin2 = findGelectronBinary(p);
      if (bin2) return bin2;
    }
    dir = path.dirname(dir);
  }
  return null;
}

async function getNodeBinary(platform, arch, cacheDir) {
  const nodePlatform = platform === 'win32' ? 'win' : platform;
  const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const filename = `node-v${NODE_VERSION}-${nodePlatform}-${nodeArch}.${ext}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${filename}`;
  const archivePath = path.join(cacheDir, filename);
  const extractDir = path.join(cacheDir, `node-v${NODE_VERSION}-${nodePlatform}-${nodeArch}`);

  if (fs.existsSync(extractDir)) {
    log('  Node.js v' + NODE_VERSION + ' (cached)');
    return extractDir;
  }

  if (!fs.existsSync(archivePath)) {
    log('  Downloading Node.js v' + NODE_VERSION + '...');
    await download(url, archivePath);
  }

  log('  Extracting Node.js...');
  fs.mkdirSync(extractDir, { recursive: true });
  if (platform === 'win32') {
    extractZip(archivePath, extractDir);
  } else {
    extractTarGz(archivePath, extractDir);
  }

  // Tarball extracts into a subdirectory — flatten it
  const entries = fs.readdirSync(extractDir);
  if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
    const inner = path.join(extractDir, entries[0]);
    for (const entry of fs.readdirSync(inner)) {
      fs.renameSync(path.join(inner, entry), path.join(extractDir, entry));
    }
    fs.rmdirSync(inner);
  }

  return extractDir;
}

function copyDirSync(src, dest, exclude) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude && exclude.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateInfoPlist(name, version, exeName) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${name}</string>
  <key>CFBundleExecutable</key>
  <string>${exeName}</string>
  <key>CFBundleIdentifier</key>
  <string>com.gelectron.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}</string>
  <key>CFBundleName</key>
  <string>${name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSRequiresAquaSystemAppearance</key>
  <false/>
</dict>
</plist>`;
}

function generateWrapperScript(exeName, nodePath) {
  return `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/${exeName}" "$@"
`;
}

function generateLinuxDesktop(name, exeName) {
  return `[Desktop Entry]
Name=${name}
Exec=${exeName}
Type=Application
Categories=Utility;
`;
}

async function packageApp(opts) {
  const appDir = path.resolve(opts.dir || '.');
  const pkgPath = path.join(appDir, 'package.json');
  if (!fs.existsSync(pkgPath)) die(`No package.json in ${appDir}`);

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const name = opts.name || pkg.name || 'App';
  const version = pkg.version || '1.0.0';
  const platform = opts.platform || process.platform;
  const arch = opts.arch || process.arch;
  const outDir = path.resolve(opts.out || path.join(path.dirname(appDir), `${name}-${platform}-${arch}`));

  log(`\n  ── Gelectron Packager ──\n`);
  log(`  App:      ${name} v${version}`);
  log(`  Platform: ${platform} ${arch}`);
  log(`  Output:   ${outDir}\n`);

  // 1. Find gelectron binary
  log('  Locating gelectron binary...');
  let gelectronBin;
  if (opts.binary) {
    gelectronBin = path.resolve(opts.binary);
    if (!fs.existsSync(gelectronBin)) die(`Binary not found: ${gelectronBin}`);
  } else {
    gelectronBin = findGelectronFromAncestors(appDir);
  }

  if (!gelectronBin) die('gelectron binary not found. Run: cargo build --release');
  log(`  Found: ${path.basename(gelectronBin)}`);

  // 2. Download Node.js
  log('  Setting up Node.js runtime...');
  const cacheDir = path.join(appDir, '.gelectron-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const nodeDir = await getNodeBinary(platform, arch, cacheDir);

  // 3. Create output directory
  fs.mkdirSync(outDir, { recursive: true });

  if (platform === 'darwin') {
    await packageMac(appDir, outDir, name, version, gelectronBin, nodeDir, opts);
  } else if (platform === 'win32') {
    await packageWindows(appDir, outDir, name, version, gelectronBin, nodeDir, opts);
  } else {
    await packageLinux(appDir, outDir, name, version, gelectronBin, nodeDir, opts);
  }

  log(`\n  ✓ Packaged to ${outDir}\n`);
}

async function packageMac(appDir, outDir, name, version, gelectronBin, nodeDir, opts) {
  const appBundle = path.join(outDir, `${name}.app`);
  const contentsDir = path.join(appBundle, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const appResources = path.join(resourcesDir, 'app');

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(appResources, { recursive: true });

  const exeName = name.replace(/[^a-zA-Z0-9]/g, '');

  // Copy gelectron binary as gelectron-bin (the Rust binary)
  fs.copyFileSync(gelectronBin, path.join(macosDir, 'gelectron-bin'));
  fs.chmodSync(path.join(macosDir, 'gelectron-bin'), 0o755);

  // Copy Node.js binary
  const nodeBin = path.join(nodeDir, 'bin', 'node');
  fs.copyFileSync(nodeBin, path.join(macosDir, 'node'));
  fs.chmodSync(path.join(macosDir, 'node'), 0o755);

  // Copy Node.js shared libs if they exist
  const libDir = path.join(nodeDir, 'lib');
  if (fs.existsSync(libDir)) {
    copyDirSync(libDir, path.join(macosDir, 'lib'), ['node_modules', 'include', 'pkgconfig']);
  }

  // Copy node_modules
  const nodeModulesDir = path.join(appDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    log('  Copying node_modules...');
    copyDirSync(nodeModulesDir, path.join(macosDir, 'node_modules'), ['.cache', '.bin']);
  }

  // Copy src/electron compat layer
  const compatDir = findCompatLayer(appDir) || findCompatLayer(path.dirname(gelectronBin));
  if (compatDir) {
    copyDirSync(compatDir, path.join(macosDir, 'compat'));
  }

  // Copy app source
  log('  Copying app source...');
  const excludeDirs = ['node_modules', '.gelectron-cache', '.git', 'target'];
  copyDirSync(appDir, appResources, excludeDirs);

  // Generate bash launcher (CFBundleExecutable) — sets PATH so gelectron-bin finds node
  const wrapper = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$DIR:$PATH"
export GELECTRON_NATIVE=1
exec "$DIR/gelectron-bin" "$@"
`;
  fs.writeFileSync(path.join(macosDir, exeName), wrapper, { mode: 0o755 });

  // Generate Info.plist
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), generateInfoPlist(name, version, exeName));

  // Ad-hoc sign so the app runs on other Macs
  log('  Signing app...');
  try {
    execSync(`codesign --force --deep --sign - "${appBundle}"`, { stdio: 'pipe' });
    log('  Signed (ad-hoc)');
  } catch (e) {
    log('  Warning: codesign failed (app may be blocked on other Macs)');
  }

  log(`  Created: ${appBundle}`);
}

async function packageWindows(appDir, outDir, name, version, gelectronBin, nodeDir, opts) {
  const exeName = name.replace(/[^a-zA-Z0-9]/g, '');

  // Copy gelectron binary
  fs.copyFileSync(gelectronBin, path.join(outDir, `${exeName}.exe`));

  // Copy Node.js
  fs.copyFileSync(path.join(nodeDir, 'node.exe'), path.join(outDir, 'node.exe'));

  // Copy node_modules
  const nodeModulesDir = path.join(appDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    log('  Copying node_modules...');
    copyDirSync(nodeModulesDir, path.join(outDir, 'node_modules'), ['.cache', '.bin']);
  }

  // Copy compat layer
  const compatDirWin = findCompatLayer(appDir) || findCompatLayer(path.dirname(gelectronBin));
  if (compatDirWin) {
    copyDirSync(compatDirWin, path.join(outDir, 'compat'));
  }

  // Copy app source
  log('  Copying app source...');
  copyDirSync(appDir, path.join(outDir, 'app'), ['node_modules', '.gelectron-cache', '.git', 'target']);

  // Generate VBScript launcher (no terminal window)
  const vbs = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Environment("Process")("PATH") = WshShell.CurrentDirectory & ";" & WshShell.Environment("Process")("PATH")
WshShell.Run """" & WshShell.CurrentDirectory & "\\${exeName}.exe""", 1, False
`;
  fs.writeFileSync(path.join(outDir, `${exeName}.vbs`), vbs);

  // Also keep a .bat for convenience
  const bat = `@echo off
set DIR=%~dp0
set PATH=%DIR%;%PATH%
"%DIR%${exeName}.exe" %*
`;
  fs.writeFileSync(path.join(outDir, `${exeName}.bat`), bat);

  log(`  Created: ${outDir}`);
}

async function packageLinux(appDir, outDir, name, version, gelectronBin, nodeDir, opts) {
  const exeName = name.replace(/[^a-zA-Z0-9]/g, '');

  // Copy gelectron binary
  fs.copyFileSync(gelectronBin, path.join(outDir, exeName));
  fs.chmodSync(path.join(outDir, exeName), 0o755);

  // Copy Node.js
  const nodeBin = path.join(nodeDir, 'bin', 'node');
  fs.copyFileSync(nodeBin, path.join(outDir, 'node'));
  fs.chmodSync(path.join(outDir, 'node'), 0o755);

  // Copy node_modules
  const nodeModulesDir = path.join(appDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    log('  Copying node_modules...');
    copyDirSync(nodeModulesDir, path.join(outDir, 'node_modules'), ['.cache', '.bin']);
  }

  // Copy compat layer
  const compatDirLinux = findCompatLayer(appDir) || findCompatLayer(path.dirname(gelectronBin));
  if (compatDirLinux) {
    copyDirSync(compatDirLinux, path.join(outDir, 'compat'));
  }

  // Copy app source
  log('  Copying app source...');
  copyDirSync(appDir, path.join(outDir, 'app'), ['node_modules', '.gelectron-cache', '.git', 'target']);

  // Generate launcher script
  const launcher = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$DIR:$PATH"
export GELECTRON_NATIVE=1
exec "$DIR/${exeName}" "$@"
`;
  fs.writeFileSync(path.join(outDir, exeName), launcher, { mode: 0o755 });

  // Desktop file
  fs.writeFileSync(path.join(outDir, `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.desktop`),
    generateLinuxDesktop(name, exeName));

  log(`  Created: ${outDir}`);
}

// CLI
const args = process.argv.slice(2);
const opts = { dir: '.', platform: process.platform, arch: process.arch };

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--dir': case '-d': opts.dir = args[++i]; break;
    case '--name': case '-n': opts.name = args[++i]; break;
    case '--out': case '-o': opts.out = args[++i]; break;
    case '--platform': case '-p': opts.platform = args[++i]; break;
    case '--arch': case '-a': opts.arch = args[++i]; break;
    case '--binary': case '-b': opts.binary = args[++i]; break;
    case '--help': case '-h':
      console.log(`
  gelectron-packager — Package Gelectron apps for distribution

  Usage:
    gelectron-packager [options]

  Options:
    --dir, -d        App directory (default: .)
    --name, -n       App name (default: from package.json)
    --out, -o        Output directory (default: <name>-<platform>-<arch>)
    --platform, -p   Target platform: darwin, win32, linux (default: current)
    --arch, -a       Target arch: x64, arm64 (default: current)
    --binary, -b     Path to gelectron binary (for cross-compiled builds)
    --help, -h       Show this help
`);
      process.exit(0);
  }
}

packageApp(opts).catch((err) => {
  die(err.message);
});
