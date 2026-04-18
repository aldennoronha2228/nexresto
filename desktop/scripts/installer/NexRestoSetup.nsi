; NexResto Windows Installer (NSIS / MUI2)
; Build from repository root with makensis.

Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"

; --------------------------------
; App metadata
; --------------------------------
!define APP_NAME "NexResto"
!define COMPANY_NAME "NexResto"
!define VERSION "1.0.0"

; Detect source folder variant (supports '&' and '&amp;' names)
!define SOURCE_DIR_RAW "NexResto  Restaurant & Hotel Digital Menus-win32-x64"
!define SOURCE_DIR_ESCAPED "NexResto  Restaurant &amp; Hotel Digital Menus-win32-x64"

!if /FileExists "${SOURCE_DIR_RAW}\*.*"
  !define SOURCE_DIR "${SOURCE_DIR_RAW}"
!else
  !if /FileExists "${SOURCE_DIR_ESCAPED}\*.*"
    !define SOURCE_DIR "${SOURCE_DIR_ESCAPED}"
  !else
    !error "Could not find source app folder. Expected '${SOURCE_DIR_RAW}' or '${SOURCE_DIR_ESCAPED}' next to this .nsi file."
  !endif
!endif

Name "${APP_NAME}"
OutFile "NexRestoSetup.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "Software\${COMPANY_NAME}\${APP_NAME}" "Install_Dir"
RequestExecutionLevel admin

; --------------------------------
; Installer size optimization
; --------------------------------
SetCompressor /SOLID lzma
SetCompressorDictSize 32
CRCCheck on

; --------------------------------
; Variables
; --------------------------------
Var MainExe

; --------------------------------
; Modern UI configuration
; --------------------------------
!define MUI_ABORTWARNING
!if /FileExists "${SOURCE_DIR}\resources\app\icon.ico"
  !define MUI_ICON "${SOURCE_DIR}\resources\app\icon.ico"
  !define MUI_UNICON "${SOURCE_DIR}\resources\app\icon.ico"
!endif

!if /FileExists "${SOURCE_DIR}\resources\app\icon.ico"
  Icon "${SOURCE_DIR}\resources\app\icon.ico"
  UninstallIcon "${SOURCE_DIR}\resources\app\icon.ico"
!else
  !error "Missing icon file at '${SOURCE_DIR}\\resources\\app\\icon.ico'."
!endif

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; --------------------------------
; Helper: detect main executable after files are copied
; --------------------------------
Function DetectMainExe
  StrCpy $MainExe ""

  FindFirst $0 $1 "$INSTDIR\*.exe"
  ${DoWhile} $1 != ""
    ${If} $1 != "Uninstall.exe"
      StrCpy $MainExe "$1"
      ${ExitDo}
    ${EndIf}
    FindNext $0 $1
  ${Loop}
  FindClose $0

  ${If} $MainExe == ""
    MessageBox MB_ICONSTOP|MB_OK "No application executable was found in:$\r$\n$INSTDIR"
    Abort
  ${EndIf}
FunctionEnd

; --------------------------------
; Main install section
; --------------------------------
Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy all app files recursively from detected source folder
  File /r "${SOURCE_DIR}\*.*"

  ; Ensure custom icon file exists for Windows shortcuts/search rendering
  SetOutPath "$INSTDIR\resources\app"
  File "${SOURCE_DIR}\resources\app\icon.ico"
  SetOutPath "$INSTDIR"

  ; Store install path in registry
  WriteRegStr HKLM "Software\${COMPANY_NAME}\${APP_NAME}" "Install_Dir" "$INSTDIR"

  ; Detect the main .exe dynamically for shortcut targets
  Call DetectMainExe

  ; Create Start Menu folder and shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\$MainExe" "" "$INSTDIR\resources\app\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"

  ; Create desktop shortcut
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\$MainExe" "" "$INSTDIR\resources\app\icon.ico" 0

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add ARP (Apps & Features) entries
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${COMPANY_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\resources\app\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
SectionEnd

; --------------------------------
; Uninstall section
; --------------------------------
Section "Uninstall"
  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  ; Remove installed files
  RMDir /r "$INSTDIR"

  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKLM "Software\${COMPANY_NAME}\${APP_NAME}"
SectionEnd
