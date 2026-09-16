# Visora AI Agent

Visora AI Agent 是连接映序（Visora AI）网页与用户电脑上 Codex / Claude Code 的本地服务。本地开发时优先连接 `http://localhost:3000`，不需要先使用线上站点。

## 启动

```bash
node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js
```

首次启动前在 `canvas-agent/` 执行 `bun install --frozen-lockfile && bun run build`。当前使用本地源码，不依赖尚未确认发布的 npm 包；项目移动后需同步修改插件 `.mcp.json` 中的绝对路径。

需要排查连接、线程、Codex app-server 或工具调用问题时，可开启 Debug 模式：

```bash
node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js --debug
```

Debug 日志会以 `[DEBUG][HH:mm:ss]` 等传统格式输出到终端，并按启动日期保存到 `~/.visora/logs/visora-agent-YYYY-MM-DD.log`。终端日志带级别颜色，文件日志为纯文本；日志包含 HTTP、SSE、线程、turn、Codex app-server 和工具调用事件，token 与图片 Data URL 会自动隐藏。

本仓库开发时也可以直接运行：

```bash
cd canvas-agent
npm install
npm run build
node dist/index.js
```

启动后会输出本机地址和 token：

```txt
Local URL: http://127.0.0.1:17371
Connect token: xxxxxx
```

在画布右上角点击 `Agent`，填入地址和 token 后连接。

Codex app 插件会读取启动输出里的 Local URL 和 Connect token，并直接打开已配置的映序页面；Visora AI Agent 不负责生成画布打开 URL。

Visora AI Agent 默认只监听 `127.0.0.1`。网页第一次带正确 token 连接后，Agent 会记录该网页 Origin；之后其他 Origin 不能复用这个本地 Agent，除非用户清理 `~/.visora/visora-agent.json` 里的 `origins`。

## 发布

`@visora-ai/canvas-agent` 是项目包标识，尚未确认对外发布；版本号独立于根目录 `VERSION`。当前不提供自动 npm 发布承诺。

发布前需要在 GitHub 仓库 Secrets 中配置 `NPM_TOKEN`。

## Codex MCP

如果希望 Codex 终端能直接操作画布，需要先把 Visora AI Agent 注册成 Codex MCP。

直接运行 `node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js` 只启动本地 Agent 服务，不会安装 MCP，也不会增加 Codex 工具上下文。只有安装 Codex app 插件，或手动执行 `codex mcp add` 后，`visora` 工具才会进入 Codex 上下文；由于工具较多，不使用时建议移除。

通过插件安装时移除插件：

```bash
codex plugin remove visora
```

手动添加 MCP 时移除 MCP：

```bash
codex mcp remove visora
```

### Codex app 插件

仓库内提供了 Codex app 插件：`plugins/visora`。在 Codex app 中添加本仓库的 marketplace 后，可以安装 `Visora` 插件；插件会注册同一个 `visora` MCP，并带上画布操作说明。

添加本地 marketplace 时建议使用仓库绝对路径，避免 Codex 从其他工作目录解析失败：

```bash
cd /path/to/Visora
codex plugin marketplace add "$(pwd)"
codex plugin add visora@visora-local
```

插件默认通过本地构建启动 MCP；这个命令只提供 MCP 工具，不会把 MCP 写入全局配置，也不会在退出时自动卸载：

```bash
node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js mcp
```

使用时可以直接在 Codex 里说“打开映序”，插件会启动本地 Agent，读取 Local URL 和 Connect token，然后打开已配置的映序页面并自动新建、连接画布；只有明确要求使用本地项目时才会启动本地前端。

Visora AI Agent 启动后，给 Codex 添加 MCP：

```bash
codex mcp add visora -- node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js mcp
```

本仓库开发时可以改成，实际使用建议替换为本机绝对路径：

```bash
codex mcp add visora -- node /path/to/Visora/canvas-agent/dist/index.js mcp
```

Visora AI Agent 源码使用 TypeScript 编写，MCP 协议层使用官方 `@modelcontextprotocol/sdk`，工具入参使用 `zod` 描述。

如果希望终端里的 Codex 不被 MCP 审批卡住，可以在 `~/.codex/config.toml` 里给这个 MCP 设置自动放行：

```toml
[mcp_servers.visora]
command = "node"
args = ["/Users/winjay/home/www/Visora/canvas-agent/dist/index.js", "mcp"]
default_tools_approval_mode = "approve"
```

可用工具：

- `canvas_get_state`
- `canvas_get_selection`
- `canvas_export_snapshot`
- `canvas_apply_ops`
- `canvas_create_text_node`
- `canvas_create_image_prompt_flow`

`canvas_apply_ops` 示例：

```json
{
  "ops": [
    {
      "type": "add_node",
      "nodeType": "text",
      "title": "标题",
      "position": { "x": 0, "y": 0 },
      "metadata": { "content": "文本内容" }
    }
  ]
}
```

## 侧边栏 Codex

本地面板会把提示词发送给 Visora AI Agent。Agent 使用官方 `@openai/codex` CLI 的 `codex app-server --stdio` 启动并复用同一个 Codex thread，启动时会注入 `visora` MCP 配置并自动放行 MCP 审批，真正执行画布修改前仍由网页侧边栏二次确认。

侧边栏会展示 Codex 返回的 `thread.started`、`turn.started`、`item.*`、`turn.completed` 等结构化事件；Visora AI Agent 会合并短时间内的回复、思考摘要和命令输出增量，网页使用同一条消息持续更新，并把任务进度、计划、搜索、文件修改与工具操作整理为中文过程时间线。

侧边栏上传或粘贴的图片会先发到本机 Visora AI Agent，再由 Agent 临时写入本机文件并作为 app-server `localImage` 输入传给 Codex；前端会提示附件体积，单次请求体限制为 30MB。

## Claude Code

Claude Code Adapter 代码暂时保留，但当前网页侧边栏只开放 Codex。后续开放 Claude 入口时，Visora AI Agent 会调用本机 `claude -p --output-format stream-json` 并把流式 JSON 事件转发到侧边栏。

如果希望 Claude Code 也能操作画布，需要给 Claude Code 添加同一个 MCP。建议用 user scope，避免 Agent 从不同目录启动时找不到配置：

```bash
claude mcp add --scope user --transport stdio visora -- node /Users/winjay/home/www/Visora/canvas-agent/dist/index.js mcp
```

本仓库开发时可以改成：

```bash
claude mcp add --scope user --transport stdio visora -- node /path/to/Visora/canvas-agent/dist/index.js mcp
```

Visora AI Agent 调用 Claude Code 时会默认带上 `--allowedTools mcp__visora__*`，画布写操作仍由网页侧边栏确认。
