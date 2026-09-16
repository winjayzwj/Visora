---
name: open-canvas
description: 打开 Visora AI 本地画布，并自动连接本地 Visora Canvas Agent。用户要求打开、启动、进入或使用 Visora AI 画布时使用。
---

# Open Visora AI

默认使用本地 Visora AI 项目。

## 本地版

1. 在 Visora 项目中启动前端，并使用 Vite 输出的 `Local` 地址：

```bash
cd /Users/winjay/home/www/Visora/web
bun install
bun run dev
```

2. 首次使用时在项目 `canvas-agent/` 执行 `bun install --frozen-lockfile && bun run build`，然后启动本地 Agent：

```bash
node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js
```

3. 在 Codex 右侧浏览器打开 Vite 输出的本地地址，并进入 `/canvas?mode=new`；按页面提示连接本地 Agent。

## MCP 与连接地址

插件在新的 Codex 任务中加载时会自动启动 `node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js mcp`。这个 MCP 进程负责提供画布工具，不提供网页连接服务；
上面启动的普通 Visora Canvas Agent 负责提供本地连接信息。两个进程读取同一份本地配置，因此不需要用户手动填写地址或 token。

## 打开模式

用户没有明确指定打开方式时，始终使用 `mode=new` 新建画布。只有用户明确要求时才替换为：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`
