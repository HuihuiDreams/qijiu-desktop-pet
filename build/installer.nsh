; NSIS插件目录初始化修复 (ADR-020补充)
; 使用插件前进行目录检查和权限设置，避免中文路径导致的初始化失败
RequestExecutionLevel admin

!macro customInstall
  DetailPrint "正在配置七九爱宠安装环境..."

  ; 确保临时目录可访问 (修复"Can't initialize plug-ins directory"错误)
  ; 该错误常见于中文应用名或权限受限的安装环境
  SetOutPath "$INSTDIR"

  ; 这里可以添加自定义的安装逻辑，例如设置注册表或特定的文件关联
!macroend

!macro customUnInstall
  DetailPrint "正在清理七九爱宠数据..."
  ; 这里可以添加卸载时的清理逻辑，例如询问是否保留用户存档
!macroend
