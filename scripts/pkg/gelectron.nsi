; Gelectron Windows installer (NSIS)
;
; Build with makensis from a staging directory containing:
;   gelectron.exe
;   compat\*.js
;
;   makensis /DVERSION=0.1.1 /DARCH=x64 Gelectron.nsi
;
; Installs to $PROGRAMFILES64\Gelectron, adds it to the machine PATH, creates
; Start Menu + Add/Remove Programs entries, and writes an uninstaller.

!include "MUI2.nsh"
!include "WordFunc.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef ARCH
  !define ARCH "x64"
!endif

!define APPNAME "Gelectron"
!define COMPANY "gelectron"
!define ENV_KEY 'HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"'
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"

Name "${APPNAME}"
OutFile "Gelectron-${VERSION}-${ARCH}.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
InstallDirRegKey HKLM "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel admin

; ── Modern UI ──────────────────────────────────────────────────────────────

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── Install section ─────────────────────────────────────────────────────────

Section "Install"
  SetShellVarContext all
  SetOutPath "$INSTDIR"

  File "gelectron.exe"
  File /r "compat"

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\gelectron.exe"

  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\gelectron.exe"

  ; Add $INSTDIR to the machine PATH (add-if-not-present via WordFunc)
  ReadRegStr $0 ${ENV_KEY} "Path"
  ${WordAdd} $0 ";" "+$INSTDIR" $1
  WriteRegExpandStr ${ENV_KEY} "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment"
SectionEnd

; ── Uninstall section ───────────────────────────────────────────────────────

Section "Uninstall"
  SetShellVarContext all
  ; Remove $INSTDIR from the machine PATH
  ReadRegStr $0 ${ENV_KEY} "Path"
  ${WordAdd} $0 ";" "-$INSTDIR" $1
  WriteRegExpandStr ${ENV_KEY} "Path" $1
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment"

  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"

  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\${APPNAME}"

  RMDir /r "$INSTDIR"
SectionEnd