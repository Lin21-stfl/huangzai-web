#!/usr/bin/env bash
# ==========================================================================
# push-github.sh · 一键推送到 GitHub
# --------------------------------------------------------------------------
# 为什么需要它？本机环境有两个坑会让普通 git push 静默挂起：
#
#   1. 存在透明代理（http_proxy=127.0.0.1:1165），且 DNS 把 github.com
#      解析到 127.0.0.1。代理会拦截大体积 POST，导致推送卡在握手阶段。
#      → 解决：推送前临时清除所有 *_proxy 环境变量，走直连。
#
#   2. credential.helper 链路在取得凭据后会触发 `git config --system -e`，
#      拉起文本编辑器并等待保存，非交互环境下会无限期挂起。
#      → 解决：把令牌从凭据管理器取出后直接写进 URL，并用
#              -c credential.helper= 彻底禁用助手，全程 GIT_EDITOR=true。
#
# 前提：已执行过 `git credential-manager github login` 完成浏览器授权。
# 令牌不写入任何配置文件，用完即随临时文件销毁，也不会打印到屏幕。
# ==========================================================================

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE_URL="https://github.com/Lin21-stfl/huangzai-web.git"
GITHUB_USER="Lin21-stfl"

# 没有待推送内容就直接结束，避免无意义地取令牌
if git diff --quiet HEAD && git diff --cached --quiet; then
  echo "工作区干净，无待提交内容。"
else
  echo "!! 存在未提交改动，请先 git add / git commit："
  git status --short
  exit 1
fi

CRED_TMP="$(mktemp)"
cleanup() { rm -f "$CRED_TMP"; }
trap cleanup EXIT

# 从 Git 凭据管理器取回 OAuth 令牌（输出仅在临时文件中，不打印）
if ! printf 'protocol=https\nhost=github.com\nusername=%s\n\n' "$GITHUB_USER" \
     | GIT_TERMINAL_PROMPT=1 git credential-manager get > "$CRED_TMP" 2>/dev/null; then
  echo "!! 无法取回凭据。请先执行："
  echo "     git credential-manager github login --browser"
  exit 1
fi

TOKEN="$(awk -F= '/^password=/{print $2}' "$CRED_TMP")"
if [ -z "$TOKEN" ]; then
  echo "!! 未取到令牌，请重新登录："
  echo "     git credential-manager github login --browser"
  exit 1
fi

echo "正在推送分支 ${BRANCH} → ${REMOTE_URL}"

env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY \
    GIT_EDITOR=true GIT_TERMINAL_PROMPT=0 \
  git -c credential.helper= -c core.editor=true \
      push --progress "https://${GITHUB_USER}:${TOKEN}@github.com/Lin21-stfl/huangzai-web.git" "$BRANCH"

echo ""
echo "推送完成。线上地址：https://lin21-stfl.github.io/huangzai-web/"
