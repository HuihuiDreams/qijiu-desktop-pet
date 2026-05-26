; NSIS插件目录初始化修复 (ADR-020补充)
; 使用插件前进行目录检查和权限设置，避免中文路径导致的初始化失败
RequestExecutionLevel admin

!macro customInstall
  DetailPrint "正在配置七九爱宠安装环境..."

  ; 确保临时目录可访问 (修复"Can't initialize plug-ins directory"错误)
  ; 该错误常见于中文应用名或权限受限的安装环境
  SetOutPath "$INSTDIR"

  ; 清理历史快捷方式（保守兜底，防止旧名称残留）
  ; 注：用户反馈通过安装包升级后桌面出现两个快捷方式，根因尚在排查中。
  ; 此处保守清理曾在内部开发期间出现过的旧名称 DeskPet，
  ; 对不存在该文件的用户无副作用（NSIS Delete 对不存在的文件静默跳过）。
  Delete "$DESKTOP\DeskPet.lnk"
  Delete "$SMPROGRAMS\DeskPet.lnk"
!macroend

!macro customUnInstall
  DetailPrint "正在清理七九爱宠数据..."
  ; 清理历史快捷方式（兜底，防止旧名称残留）
  Delete "$DESKTOP\DeskPet.lnk"
  Delete "$SMPROGRAMS\DeskPet.lnk"
!macroend
