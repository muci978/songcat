; SongCat NSIS 自定义脚本
; 功能：安装时检查版本（一致/旧/新），卸载时询问是否删除用户数据

!include "WordFunc.nsh"
!insertmacro VersionCompare

; ==================== 安装时版本检查 ====================
!macro customInit
  ; 读取已安装版本（per-user: HKCU 卸载注册表）
  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}" "DisplayVersion"
  StrCmp $R1 "" init_continue  ; 无安装 → 继续

    ; 有安装，比较版本
    StrCmp $R1 "${VERSION}" init_same 0 init_diff

  init_same:
    ; 版本一致 → 直接成功退出
    MessageBox MB_OK "SongCat ${VERSION} 已安装，无需重复安装。"
    SetAutoClose true
    Quit

  init_diff:
    ${VersionCompare} "$R1" "${VERSION}" $R2
    ; $R2: 0=相等, 1=$R1>VERSION（已装更新）, 2=$R1<VERSION（已装旧版）
    StrCmp $R2 "1" init_newer 0
    ; $R2 == 2 → 旧版本，继续更新安装
    Goto init_continue

  init_newer:
    ; 已装更新版本 → 提示并退出（降级保护）
    MessageBox MB_OK|MB_ICONSTOP \
      "已安装更新版本 $R1。$\n$\n当前安装包版本 ${VERSION} 较旧，无需降级。$\n如需继续，请先卸载新版。"
    Quit

  init_continue:
!macroend

; ==================== 卸载时询问删除用户数据 ====================
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "是否同时删除 SongCat 的用户数据？$\n$\n包含：曲库、数据库、录音、设置。$\n选择「否」将保留数据，下次安装时自动恢复。" \
    ID_NO un_skip_data
      RMDir /r "$APPDATA\SongCat"
  un_skip_data:
!macroend
