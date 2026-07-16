param(
    [Parameter(Mandatory=$true)]
    [string]$commitMessage
)

# Collect changed files into a single string.
$status = (git status --porcelain) -join "`n"

# Require a changelog entry before committing.
if (-not ($status -match "CHANGELOG\.md")) {
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Push blocked: CHANGELOG.md has not been updated." -ForegroundColor Red
    Write-Host "Project workflow requires a changelog entry for every commit." -ForegroundColor Yellow
    Write-Host "Update CHANGELOG.md, then run this script again." -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Red

    # Print a ready-to-copy changelog template.
    $dateStr = Get-Date -Format "yyyy-MM-dd"
    Write-Host "Add a section near the top using this format:" -ForegroundColor Yellow
    Write-Host "## [WIP] - $dateStr"
    Write-Host "### Added"
    Write-Host "- "
    Write-Host "### Changed"
    Write-Host "- "
    Write-Host "### Fixed"
    Write-Host "- "
    
    # Open the changelog in the default editor.
    Start-Process "CHANGELOG.md"
    exit 1
}

# CHANGELOG.md is present, so continue with commit and push.
Write-Host "CHANGELOG.md detected. Preparing commit..." -ForegroundColor Green

git add .

# Prevent internal workspaces and scan output from being committed (allowing version-controlled .agents/skills/).
$stagedSensitive = git diff --cached --name-only --diff-filter=ACMR | Where-Object { $_ -match "(^\.codex/|^\.agents/|^security-scans/)" -and $_ -notmatch "^\.agents/skills/" }
if ($stagedSensitive) {
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Push blocked: staged files include an internal or scan-output directory." -ForegroundColor Red
    Write-Host "Ran git reset. Review the files and add an appropriate .gitignore rule." -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Red
    git reset
    exit 1
}

git commit -m "$commitMessage"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit failed. Review the Git output above." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Pushing to origin main..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Push completed." -ForegroundColor Green
} else {
    Write-Host "Push failed. Check network connectivity or Git conflicts." -ForegroundColor Red
}

