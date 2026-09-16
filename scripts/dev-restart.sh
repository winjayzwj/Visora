#!/usr/bin/env bash
# 重启本地开发服务：用户端 Web + 管理后台 Admin，对外只占一个端口。
#
#   Web    http://127.0.0.1:8890/
#   Admin  http://127.0.0.1:8890/admin
#
# 端口固定：Web 占 8890，Admin 在内部 8891 上跑，由 Web 的 Vite 把 /admin 代理过去。
# 对外只暴露 8890，浏览器 origin 与 Docker 形态（docker-compose.p1.yml 的 gateway）一致，
# 本地存储数据可以通用，也省得每次记两个端口。
#
# 用法：./scripts/dev-restart.sh
# 可选环境变量：
#   WEB_PORT            对外端口，默认 8890
#   ADMIN_PORT          Admin 内部端口，默认 8891
#   VISORA_API_TARGET   API 地址，默认 http://127.0.0.1:8090
#
# 只重启 dev server，不动 8090 的 API 服务与 MongoDB。
# 对外端口若被 Docker 容器占用，会用 docker stop 停掉该容器（可逆，见结尾提示）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_PORT="${WEB_PORT:-8890}"
ADMIN_PORT="${ADMIN_PORT:-8891}"
API_TARGET="${VISORA_API_TARGET:-http://127.0.0.1:8090}"
# 就绪等待窗口（秒）。冷启动（例如清过 node_modules/.vite 之后）要重新预构建依赖，
# 实测 Web 约 51 秒、Admin 约 106 秒，所以默认给 180 秒，避免误报启动失败。
READY_TIMEOUT="${VISORA_READY_TIMEOUT:-180}"
WEB_LOG="/tmp/visora-dev-web.log"
ADMIN_LOG="/tmp/visora-dev-admin.log"
# 旧版脚本用的两个端口，顺手清掉可能残留的 dev server。
LEGACY_PORTS=(5173 5176)

listening_pids() {
    lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

# 检查的是本机端口，必须绕过环境里的 HTTP_PROXY / HTTPS_PROXY，
# 否则 curl 会把请求交给代理，代理连不上时返回 502，就绪判断会失真。
probe() {
    curl -s -o /dev/null -w '%{http_code}' --noproxy '*' --max-time 2 "$1" 2>/dev/null || true
}

# docker 可能不在 PATH 里（例如被工具链的 shim 覆盖），按顺序找一遍。
find_docker() {
    local candidate
    for candidate in docker /usr/local/bin/docker "$HOME/.orbstack/bin/docker" \
        /Applications/OrbStack.app/Contents/MacOS/xbin/docker; do
        if command -v "$candidate" >/dev/null 2>&1; then
            command -v "$candidate"
            return 0
        fi
    done
    return 1
}

# 找出把该端口发布到宿主机的容器名；没有则输出空。
docker_container_on_port() {
    local docker_bin
    docker_bin="$(find_docker)" || return 0
    "$docker_bin" ps --filter "publish=$1" --format '{{.Names}}' 2>/dev/null || true
}

# 让 dev server 脱离当前进程组与会话。
# 只靠 nohup 是不够的：nohup 只忽略 SIGHUP，并不改变进程组，父脚本退出后进程仍可能
# 被按进程组一并回收。macOS 没有 setsid 命令，用系统自带的 perl 调 POSIX::setsid 兜底。
# 注意：这里不能开 set -m，否则后台作业自成进程组组长，setsid 会以 EPERM 失败。
detach() {
    if command -v setsid >/dev/null 2>&1; then
        setsid "$@"
        return
    fi
    if command -v perl >/dev/null 2>&1; then
        perl -e 'use POSIX qw(setsid); setsid(); exec { $ARGV[0] } @ARGV or die "exec failed: $!";' -- "$@"
        return
    fi
    echo "  警告：找不到 setsid 或 perl，进程不会脱离当前进程组" >&2
    "$@"
}

wait_port_free() {
    local port="$1"
    for _ in $(seq 20); do
        [ -z "$(listening_pids "$port")" ] && return 0
        sleep 0.3
    done
    return 1
}

release_port() {
    local port="$1"

    # Docker 容器优先处理，而且只能走 docker stop。
    # 占用端口的 PID 是 OrbStack 的转发进程，kill 它会连带断掉其它容器的端口映射。
    local containers docker_bin
    containers="$(docker_container_on_port "$port")"
    if [ -n "$containers" ]; then
        docker_bin="$(find_docker)"
        local name
        for name in $containers; do
            echo "  端口 ${port}：停止 Docker 容器 $name（恢复用 docker start $name）"
            "$docker_bin" stop "$name" >/dev/null
        done
        wait_port_free "$port" || echo "  端口 ${port}：容器已停但端口仍被占用"
    fi

    local pids
    pids="$(listening_pids "$port")"
    if [ -z "$pids" ]; then
        echo "  端口 ${port}：已空闲"
        return
    fi

    echo "  端口 ${port}：停止进程 $pids"
    kill $pids 2>/dev/null || true
    wait_port_free "$port" && return

    echo "  端口 ${port}：未响应，强制结束"
    kill -9 $pids 2>/dev/null || true
    wait_port_free "$port" || echo "  端口 ${port}：仍被占用，后续启动可能失败"
}

wait_http() {
    local url="$1" label="$2" log="$3"
    local attempts=$((READY_TIMEOUT * 2))
    for _ in $(seq "$attempts"); do
        if [ "$(probe "$url")" = "200" ]; then
            echo "  $label 就绪：$url"
            return 0
        fi
        sleep 0.5
    done
    echo "  $label 未在 ${READY_TIMEOUT} 秒内就绪，查看日志：$log"
    return 1
}

# 光看状态码不够：/admin 如果代理没生效，会落回 Web 的 SPA 并同样返回 200。
# 这里核对 HTML 里引用的是后台自己的入口模块。
verify_admin_entry() {
    local body
    body="$(curl -s --noproxy '*' --max-time 5 "http://127.0.0.1:$WEB_PORT/admin/" || true)"
    if printf '%s' "$body" | grep -q '/admin/src/main.tsx'; then
        echo "  Admin 入口确认：/admin 由后台应用响应"
        return 0
    fi
    echo "  警告：/admin 返回的不是后台入口，代理可能未生效"
    return 1
}

require_vite() {
    if [ ! -x "$1/node_modules/.bin/vite" ]; then
        echo "错误：$1 未安装依赖，请先在该目录执行 npm install" >&2
        exit 1
    fi
}

echo "== 停止现有 dev server =="
release_port "$WEB_PORT"
release_port "$ADMIN_PORT"
for legacy in "${LEGACY_PORTS[@]}"; do
    if [ "$legacy" != "$WEB_PORT" ] && [ "$legacy" != "$ADMIN_PORT" ]; then
        pids="$(listening_pids "$legacy")"
        if [ -n "$pids" ]; then
            echo "  端口 ${legacy}：清理旧版 dev server $pids"
            kill $pids 2>/dev/null || true
        fi
    fi
done

require_vite "$ROOT/web"
require_vite "$ROOT/admin"

# CI=true 是必须的，不是可选优化：vite 在非 CI 环境下会监听 process.stdin 的 end 事件并
# 据此关闭服务器，而脱离终端的进程 stdin 立刻就是 EOF，dev server 会在启动后马上自杀。
# 设了 CI 之后 vite 不再注册这个监听；CI 在 vite 里只影响清屏、日志格式与 CLI 快捷键，
# 不影响构建、HMR 与文件监听。
echo "== 启动 Web（对外端口 ${WEB_PORT}）=="
cd "$ROOT/web"
(
    export CI=true
    export VISORA_WEB_PORT="$WEB_PORT"
    export VISORA_API_TARGET="$API_TARGET"
    export VISORA_ADMIN_TARGET="http://127.0.0.1:$ADMIN_PORT"
    detach ./node_modules/.bin/vite
) </dev/null >"$WEB_LOG" 2>&1 &

echo "== 启动 Admin（内部端口 ${ADMIN_PORT}，经 ${WEB_PORT}/admin 访问）=="
cd "$ROOT/admin"
(
    export CI=true
    export VISORA_ADMIN_PORT="$ADMIN_PORT"
    export VISORA_API_TARGET="$API_TARGET"
    # 指向对外入口：同源后「返回创作台」才能解析出可跳转的地址。
    export VITE_WEB_ORIGIN="http://127.0.0.1:$WEB_PORT"
    detach ./node_modules/.bin/vite
) </dev/null >"$ADMIN_LOG" 2>&1 &

echo "== 等待就绪 =="
wait_http "http://127.0.0.1:$WEB_PORT/" "Web  " "$WEB_LOG"
wait_http "http://127.0.0.1:$WEB_PORT/admin/" "Admin" "$ADMIN_LOG"
verify_admin_entry || true

WEB_PID="$(listening_pids "$WEB_PORT" | tr '\n' ' ')"
ADMIN_PID="$(listening_pids "$ADMIN_PORT" | tr '\n' ' ')"

cat <<EOF

完成：
  Web    http://127.0.0.1:$WEB_PORT/
  登录   http://127.0.0.1:$WEB_PORT/login
  Admin  http://127.0.0.1:$WEB_PORT/admin

  API    ${API_TARGET}（未改动）
  监听   Web pid $WEB_PID/ Admin pid $ADMIN_PID

日志：
  tail -f $WEB_LOG
  tail -f $ADMIN_LOG

若本次停过 Docker 网关，恢复命令：
  docker start visora-p1-gateway-1
EOF
