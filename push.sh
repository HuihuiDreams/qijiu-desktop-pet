#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 检查是否提供了 commit message
if [ -z "$1" ]; then
    echo -e "${RED}错误: 必须提供提交信息 (commit message)。${NC}"
    echo "用法: ./push.sh \"你的提交信息\""
    exit 1
fi

COMMIT_MESSAGE="$1"

# 获取 Git 状态中已修改的文件列表，并检查 CHANGELOG.md 是否在其中
if ! git status --porcelain | grep -q "CHANGELOG\.md"; then
    echo -e "${RED}==========================================${NC}"
    echo -e "${RED}❌ 拦截 Push: CHANGELOG.md 尚未更新！${NC}"
    echo -e "${YELLOW}根据项目工作流规范，每次提交必须附带更新日志。${NC}"
    echo -e "${YELLOW}正在为您打开 CHANGELOG.md，请填写后保存并关闭文件，然后再运行此脚本...${NC}"
    echo -e "${RED}==========================================${NC}"

    # 获取当前日期并准备占位符
    DATE_STR=$(date +"%Y-%m-%d")
    echo -e "${YELLOW}提示：请在头部添加类似如下格式的内容：${NC}"
    echo "## [WIP] - $DATE_STR"
    echo "### Added"
    echo "- "
    echo "### Changed"
    echo "- "
    echo "### Fixed"
    echo "- "
    
    # 在 macOS 上使用默认编辑器（或默认关联程序）打开文件
    open CHANGELOG.md
    exit 1
fi

# 如果包含 CHANGELOG.md，则执行正常的提交和上传逻辑
echo -e "${GREEN}✅ 检测到 CHANGELOG.md 已更新。准备提交流程...${NC}"

git add .
git commit -m "$COMMIT_MESSAGE"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Commit 失败，请检查。${NC}"
    exit $?
fi

echo -e "${CYAN}⬆️ 正在推送到远程仓库 origin main...${NC}"
git push origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}🎉 Push 成功完成！${NC}"
else
    echo -e "${RED}❌ Push 失败，请检查网络或冲突。${NC}"
fi
