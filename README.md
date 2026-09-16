<p align="center">
  <img src="web/public/logo.svg" width="96" alt="Visora AI logo">
</p>

<h1 align="center">映序 · Visora AI</h1>

<p align="center">
  面向视觉创作的 AI 工作台，把画布编排、模型生成、参考素材和提示词沉淀放在同一个浏览器工作流里。
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316?style=flat-square" alt="MIT License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="canvas-agent/README.md">本地 Agent</a> · <a href="plugins/visora">Codex App 插件</a>
</p>

## 产品定位

映序（Visora AI）是一款浏览器端 AI 视觉创作工作台。你可以在画布中组织文本、图片、视频和生成配置，连接自己的 OpenAI-compatible 模型接口，持续迭代提示词、参考素材与生成结果。

当前版本以网页版为主，数据默认保存在浏览器本地，适合个人创作、原型验证和私有化部署。账号、云端项目、额度和管理后台属于后续平台化建设范围。

> [!CAUTION]
> 项目目前处于开发阶段，不保证历史数据兼容。浏览器本地存储格式、配置结构和部署标识都可能调整。

## 核心功能

- 画布工作台：多项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：浏览器前台连接你配置的 OpenAI-compatible 接口，支持文生图、图生图、参考图编辑、文本问答、音频和视频生成。
- 画布助手：围绕选中节点和上游节点对话、生成内容，并把结果插回画布。
- 本地 Agent：通过本机 Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布。
- 插件系统：通过 URL 安装、启用、更新和卸载远程节点插件，也可以使用 TypeScript SDK 开发节点插件。
- 提示词库与素材：缓存提示词来源，管理可复用的图片、视频、音频和文本素材。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)。

## 快速开始

AI API Key、Base URL、画布、素材和生成记录默认保存在浏览器本地。

### 本地开发

在已取得的 Visora 仓库目录中执行：

```bash
cd /path/to/Visora/web
bun install
bun run dev
```

默认访问 `http://localhost:3000`。

同时重启用户端（5173）与管理后台（5176）两个开发服务：

```bash
./scripts/dev-restart.sh
```

### Docker 运行

使用本地源码构建并启动：

```bash
cd /path/to/Visora
docker compose -f docker-compose.local.yml up -d --build
```

本地构建模式默认访问 `http://localhost:8888`。

如果已有以 `visora` 为名称发布的镜像，可以使用根目录 Compose 配置：

```bash
cd /path/to/Visora
VISORA_IMAGE=visora:latest docker compose up -d
```

根目录 Compose 配置将容器端口映射到宿主机 `8888`，访问 `http://localhost:8888`。部署到自己的镜像仓库时，只需把 `VISORA_IMAGE` 设置为实际镜像地址，不需要修改项目中的品牌标识。

首次打开后进入配置，填入自己的 OpenAI-compatible `Base URL` 和 `API Key`。如果默认接口调用方式与服务商不同，可以使用自定义生图或视频调用脚本。

## 文档

- [快速开始](docs/content/docs/overview/quick-start.mdx)
- [功能介绍](docs/content/docs/overview/features.mdx)
- [Docker 部署](docs/content/docs/overview/docker.zh-CN.mdx)
- [Render 部署](docs/content/docs/overview/render.zh-CN.mdx)
- [画布数据结构](docs/content/docs/development/canvas-data-structure.zh-CN.mdx)
- [本地 Agent 接入规划](docs/content/docs/progress/local-agent-integration-plan.zh-CN.mdx)

## 开源协议

本项目使用 [MIT License](LICENSE)。使用、复制、修改、分发和商业化部署时，请同时保留许可证及原版权声明。

许可范围说明：根目录保留 MIT 许可证；`plugins/visora/.codex-plugin/plugin.json` 沿用上游插件的 `AGPL-3.0` 声明，尚未确认该声明与根许可证的关系，不将其视为已统一授权。品牌修改不改变原许可证；插件对外分发前需单独确认。

## 反馈与合作

当前项目未配置公开官网、在线 Demo、社区群组或赞助入口。使用过程中如需提交问题，请在你实际托管本项目的代码平台创建 Issue，或通过团队内部约定的联系方式反馈。
