param(
    [Parameter(Mandatory=$true)]
    [string]$commitMessage
)

# 获取 Git 状态中已修改的文件列表，将其合并为一个字符串
$status = (git status --porcelain) -join "`n"

# 检查 CHANGELOG.md 是否在已修改列表里
if (-not ($status -match "CHANGELOG\.md")) {
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "❌ 拦截 Push: CHANGELOG.md 尚未更新！" -ForegroundColor Red
    Write-Host "根据项目工作流规范，每次提交必须附带更新日志。" -ForegroundColor Yellow
    Write-Host "正在为您打开 CHANGELOG.md，请填写后保存并关闭文件，然后再运行此脚本..." -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Red

    # 获取当前日期并准备占位符
    $dateStr = Get-Date -Format "yyyy-MM-dd"
    Write-Host "提示：请在头部添加类似如下格式的内容：" -ForegroundColor Yellow
    Write-Host "## [WIP] - $dateStr"
    Write-Host "### Added"
    Write-Host "- "
    Write-Host "### Changed"
    Write-Host "- "
    Write-Host "### Fixed"
    Write-Host "- "
    
    # 尝试用默认编辑器（如 VSCode 或 Notepad）打开文件
    Start-Process "CHANGELOG.md"
    exit 1
}

# 如果包含 CHANGELOG.md，则执行正常的提交和上传逻辑
Write-Host "✅ 检测到 CHANGELOG.md 已更新。准备提交流程..." -ForegroundColor Green

git add .
git commit -m "$commitMessage"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Commit 失败，请检查。" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "⬆️ 正在推送到远程仓库 origin main..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "🎉 Push 成功完成！" -ForegroundColor Green
} else {
    Write-Host "❌ Push 失败，请检查网络或冲突。" -ForegroundColor Red
}


