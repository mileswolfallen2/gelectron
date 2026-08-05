#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
    if (entry.isSymbolicLink()) {
      try {
        const target = fs.readlinkSync(srcPath);
        fs.symlinkSync(target, destPath);
      } catch (e) {
        fs.copyFileSync(srcPath, destPath);
      }
    } else if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath, exclude);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateInfoPlist(name, version, exeName, iconName) {
  const iconKey = iconName
    ? `  <key>CFBundleIconFile</key>
  <string>${iconName}</string>
`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${iconKey}  <key>CFBundleDisplayName</key>
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
  <key>NSMicrophoneUsageDescription</key>
  <string>${name} needs microphone access for voice input and audio recording.</string>
  <key>NSCameraUsageDescription</key>
  <string>${name} needs camera access for video capture and screenshots.</string>
</dict>
</plist>`;
}

function generateEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.audio-input</key>
  <true/>
  <key>com.apple.security.device.camera</key>
  <true/>
</dict>
</plist>`;
}

// Convert a PNG into a .icns using macOS built-in tools (sips + iconutil).
// Returns the path to the generated .icns, or null on failure.
function generateIcns(pngPath, outPath) {
  if (process.platform !== 'darwin') return null;
  const iconsetDir = outPath + '.iconset';
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  // sips keeps 16-bit depth on large PNGs, which macOS icon rendering handles
  // poorly (messed-up logos). Downconvert to 8-bit first when possible.
  let source = pngPath;
  const tmp8bit = outPath + '.8bit.png';
  try {
    execSync(
      `python3 -c "from PIL import Image; im=Image.open('${pngPath}').convert('RGBA'); im.save('${tmp8bit}')"`,
      { stdio: 'pipe' },
    );
    source = tmp8bit;
  } catch (e) {
    try {
      fs.rmSync(tmp8bit, { force: true });
    } catch (_) {}
  }

  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  try {
    for (const [name, size] of sizes) {
      execSync(`sips -z ${size} ${size} "${source}" --out "${path.join(iconsetDir, name)}"`, {
        stdio: 'pipe',
      });
    }
    execSync(`iconutil -c icns "${iconsetDir}" -o "${outPath}"`, { stdio: 'pipe' });
    return outPath;
  } catch (e) {
    return null;
  } finally {
    fs.rmSync(iconsetDir, { recursive: true, force: true });
    try {
      fs.rmSync(tmp8bit, { force: true });
    } catch (_) {}
  }
}

function generateWrapperScript(exeName, nodePath) {
  return `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/${exeName}" "$@"
`;
}

function sha512File(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('hex');
}

// Launcher preamble shared by the macOS and Linux bash launchers. It exports
// the update metadata the autoUpdater reads, and applies any staged update
// (atomic rename of each payload item) before starting the engine.
function bashLauncher(exeName, engineName) {
  return `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$DIR:$PATH"
export GELECTRON_NATIVE=1
export GELECTRON_PACKAGED=1
export GELECTRON_ENGINE=${engineName}
export GELECTRON_LAUNCHER="$DIR/${exeName}"
if [ -f "$DIR/.update/apply.sh" ]; then
  if sh "$DIR/.update/apply.sh"; then
    rm -f "$DIR/.update/apply.sh" "$DIR/.update/pending.json"
  fi
fi
exec "$DIR/${engineName}" "$@"
`;
}

// Build the auto-update artifacts: a `payload/` staging dir (full bundle) tarballed
// next to a `latest.yml` manifest with version, path and sha512. Upload both to a
// GitHub release and point autoUpdater.setFeedURL at latest.yml.
function makeUpdateArtifacts(outDir, name, version, platform, arch) {
  const exeName = name.replace(/[^a-zA-Z0-9]/g, '');

  let appDir, compatDir, nodeFile, engineFile, libDir;
  if (platform === 'darwin') {
    const macos = path.join(outDir, `${name}.app`, 'Contents', 'MacOS');
    appDir = path.join(outDir, `${name}.app`, 'Contents', 'Resources', 'app');
    compatDir = path.join(macos, 'compat');
    nodeFile = path.join(macos, 'node');
    engineFile = path.join(macos, 'gelectron-bin');
    libDir = path.join(macos, 'lib');
  } else if (platform === 'win32') {
    appDir = path.join(outDir, 'app');
    compatDir = path.join(outDir, 'compat');
    nodeFile = path.join(outDir, 'node.exe');
    engineFile = path.join(outDir, `${exeName}.exe`);
    libDir = null;
  } else {
    appDir = path.join(outDir, 'app');
    compatDir = path.join(outDir, 'compat');
    nodeFile = path.join(outDir, 'node');
    engineFile = path.join(outDir, 'gelectron-bin');
    libDir = null;
  }

  if (!fs.existsSync(engineFile)) die(`engine binary not found: ${engineFile}`);

  const staging = path.join(outDir, '.update-stage');
  const payloadDir = path.join(staging, 'payload');
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(payloadDir, { recursive: true });

  const copyFile = (src, dest) => {
    fs.copyFileSync(src, dest);
    fs.chmodSync(dest, 0o755);
  };

  copyFile(engineFile, path.join(payloadDir, 'engine'));
  if (fs.existsSync(nodeFile)) copyFile(nodeFile, path.join(payloadDir, 'node'));
  if (fs.existsSync(compatDir)) copyDirSync(compatDir, path.join(payloadDir, 'compat'), []);
  if (fs.existsSync(appDir)) copyDirSync(appDir, path.join(payloadDir, 'app'), []);
  if (libDir && fs.existsSync(libDir)) copyDirSync(libDir, path.join(payloadDir, 'lib'), []);

  const updateDir = path.join(outDir, 'update');
  fs.mkdirSync(updateDir, { recursive: true });
  const archiveName = `${exeName}-${version}-${platform}-${arch}.tar.gz`;
  const archivePath = path.join(updateDir, archiveName);

  log('  Building update archive...');
  execSync(`tar -czf "${archivePath}" payload`, { cwd: staging, stdio: 'pipe' });
  fs.rmSync(staging, { recursive: true, force: true });

  const sha512 = sha512File(archivePath);
  fs.writeFileSync(
    path.join(updateDir, 'latest.yml'),
    `version: ${version}\npath: ${archiveName}\nsha512: ${sha512}\n`,
  );
  log(`  Update artifacts: update/${archiveName} (sha512 ${sha512.slice(0, 12)}…)`);
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

  makeUpdateArtifacts(outDir, name, version, platform, arch);

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

  // Copy node_modules next to the app source (Resources/app), where Node
  // resolves them. Keep them out of MacOS/: codesign treats that dir as
  // executable code and chokes on some libs (e.g. sharp's libvips).
  const nodeModulesDir = path.join(appDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    log('  Copying node_modules...');
    copyDirSync(nodeModulesDir, path.join(appResources, 'node_modules'), ['.cache', '.bin', 'electron']);
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

  // Generate bash launcher (CFBundleExecutable) — sets PATH so gelectron-bin
  // finds node, exports update metadata, and applies any pending update.
  fs.writeFileSync(path.join(macosDir, exeName), bashLauncher(exeName, 'gelectron-bin'), { mode: 0o755 });

  // Generate Info.plist
  const iconSource = path.join(appResources, 'icon.png');
  let iconName = null;
  if (fs.existsSync(iconSource)) {
    const icnsPath = path.join(resourcesDir, 'AppIcon.icns');
    if (generateIcns(iconSource, icnsPath)) {
      iconName = 'AppIcon';
      log('  Generated app icon (AppIcon.icns)');
    }
  }
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), generateInfoPlist(name, version, exeName, iconName));

  // Generate entitlements (microphone/camera access for webview media capture)
  const entitlementsPath = path.join(contentsDir, 'entitlements.plist');
  fs.writeFileSync(entitlementsPath, generateEntitlements());

  // Ad-hoc sign so the app runs on other Macs.
  // --deep signs gelectron-bin (the process that hosts the webview and
  // captures audio) with the mic/camera entitlements too. Safe now that
  // node_modules lives in Resources/app, not MacOS/.
  log('  Signing app...');
  try {
    execSync(`codesign --force --deep --sign - --entitlements "${entitlementsPath}" "${appBundle}"`, { stdio: 'pipe' });
    log('  Signed (ad-hoc, mic/camera entitlements)');
  } catch (e) {
    log('  Warning: codesign failed (app may be blocked on other Macs)');
    log(`  ${e.stderr ? e.stderr.toString().trim().split('\n').pop() : e.message}`);
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
    copyDirSync(nodeModulesDir, path.join(outDir, 'node_modules'), ['.cache', '.bin', 'electron']);
  }

  // Copy compat layer
  const compatDirWin = findCompatLayer(appDir) || findCompatLayer(path.dirname(gelectronBin));
  if (compatDirWin) {
    copyDirSync(compatDirWin, path.join(outDir, 'compat'));
  }

  // Copy app source
  log('  Copying app source...');
  copyDirSync(appDir, path.join(outDir, 'app'), ['node_modules', '.gelectron-cache', '.git', 'target']);

  // Generate VBScript launcher (no terminal window). Applies any staged update
  // before starting the engine and exports the update metadata.
  const vbs = `Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
dir = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = dir
applyCmd = dir & "\\.update\\apply.cmd"
If objFSO.FileExists(applyCmd) Then
  rc = WshShell.Run("cmd /c " & Chr(34) & applyCmd & Chr(34), 0, True)
  If rc = 0 Then
    On Error Resume Next
    objFSO.DeleteFile applyCmd
    objFSO.DeleteFile dir & "\\.update\\pending.json"
    On Error GoTo 0
  End If
End If
WshShell.Environment("Process")("PATH") = dir & ";" & WshShell.Environment("Process")("PATH")
WshShell.Environment("Process")("GELECTRON_NATIVE") = "1"
WshShell.Environment("Process")("GELECTRON_PACKAGED") = "1"
WshShell.Environment("Process")("GELECTRON_ENGINE") = "${exeName}.exe"
WshShell.Environment("Process")("GELECTRON_LAUNCHER") = dir & "\\${exeName}.vbs"
WshShell.Run """" & dir & "\\${exeName}.exe""", 1, False
`;
  fs.writeFileSync(path.join(outDir, `${exeName}.vbs`), vbs);

  // Also keep a .bat for convenience
  const bat = `@echo off
set DIR=%~dp0
set PATH=%DIR%;%PATH%
set GELECTRON_NATIVE=1
set GELECTRON_PACKAGED=1
set GELECTRON_ENGINE=${exeName}.exe
set GELECTRON_LAUNCHER=%DIR%${exeName}.vbs
if exist "%DIR%.update\\apply.cmd" (
  call "%DIR%.update\\apply.cmd"
  if not errorlevel 1 (
    del /q "%DIR%.update\\apply.cmd"
    del /q "%DIR%.update\\pending.json"
  )
)
"%DIR%${exeName}.exe" %*
`;
  fs.writeFileSync(path.join(outDir, `${exeName}.bat`), bat);

  log(`  Created: ${outDir}`);
}

async function packageLinux(appDir, outDir, name, version, gelectronBin, nodeDir, opts) {
  const exeName = name.replace(/[^a-zA-Z0-9]/g, '');

  // Copy gelectron binary under a fixed name so the autoUpdater can find it.
  // (Previously this overwrote the binary with the launcher script below.)
  fs.copyFileSync(gelectronBin, path.join(outDir, 'gelectron-bin'));
  fs.chmodSync(path.join(outDir, 'gelectron-bin'), 0o755);

  // Copy Node.js
  const nodeBin = path.join(nodeDir, 'bin', 'node');
  fs.copyFileSync(nodeBin, path.join(outDir, 'node'));
  fs.chmodSync(path.join(outDir, 'node'), 0o755);

  // Copy node_modules
  const nodeModulesDir = path.join(appDir, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) {
    log('  Copying node_modules...');
    copyDirSync(nodeModulesDir, path.join(outDir, 'node_modules'), ['.cache', '.bin', 'electron']);
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
  fs.writeFileSync(path.join(outDir, exeName), bashLauncher(exeName, 'gelectron-bin'), { mode: 0o755 });

  // Desktop file
  fs.writeFileSync(path.join(outDir, `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.desktop`),
    generateLinuxDesktop(name, exeName));

  log(`  Created: ${outDir}`);
}

// CLI
const args = process.argv.slice(2);
const opts = { dir: '.', platform: process.platform, arch: process.arch };

// First non-flag argument is the app directory (unless --dir/-d was already given)
let positionalIdx = 0;
let dirSet = false;
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('-') && positionalIdx === 0 && !dirSet) {
    opts.dir = args[i];
    positionalIdx++;
    continue;
  }
  switch (args[i]) {
    case '--dir': case '-d': opts.dir = args[++i]; dirSet = true; break;
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

  Update artifacts (update/latest.yml + a full-bundle .tar.gz) are generated
  for every package. Upload them to a GitHub release and point the app's
  autoUpdater.setFeedURL at latest.yml.
`);
      process.exit(0);
  }
}

packageApp(opts).catch((err) => {
  die(err.message);
});
