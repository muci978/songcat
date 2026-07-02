; SongCat NSIS 自定义脚本
; 安装时检查版本（一致/旧/新），卸载时询问是否删除用户数据

!include "WordFunc.nsh"
!insertmacro VersionCompare

; ==================== 安装时版本检查 ====================
!macro customInit
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion"
  StrCmp $R1 "" init_continue

  StrCmp $R1 "${VERSION}" init_same init_diff

  init_same:
    MessageBox MB_OK "SongCat ${VERSION} is already installed."
    SetAutoClose true
    Quit

  init_diff:
    ${VersionCompare} "$R1" "${VERSION}" $R2
    StrCmp $R2 "1" init_newer
    ; $R2 == 2: older version installed, continue update
    Goto init_continue

  init_newer:
    MessageBox MB_OK|MB_ICONSTOP "Newer version $R1 is already installed. Downgrade to ${VERSION} is not needed."
    Quit

  init_continue:
!macroend

; ==================== 卸载时询问删除用户数据 ====================
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Delete SongCat user data too (library, database, recordings, settings)? Choose No to keep." IDNO un_skip_data
    RMDir /r "$APPDATA\SongCat"
  un_skip_data:
!macroend
