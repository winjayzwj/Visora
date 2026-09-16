# Visora AI Codex Plugin

让 Codex 可以打开并操作 Visora AI。

## 安装

先在 `canvas-agent/` 执行 `bun install --frozen-lockfile && bun run build`。插件使用本地 `node` 入口；`.mcp.json` 当前指向 `/Users/winjay/home/www/Visora/canvas-agent/dist/index.js`，换目录或换机器时需更新该路径。

在 Visora 项目根目录执行：

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add visora@visora-local
```

安装后新建一个 Codex 任务，然后输入：

```text
帮我打开并连接到 Visora AI
```

## 许可说明

插件 manifest 的 `AGPL-3.0` 来自上游，根目录 `LICENSE` 为 MIT。本次只修改品牌，不擅自变更原许可；两者范围关系待确认，插件对外分发前需核实。
