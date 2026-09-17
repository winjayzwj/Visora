# 映序

<img src="web/public/logo.svg" width="72" alt="Visora AI 标志">

**Visora AI** 是一个浏览器端的视觉创作工作台。把提示词、参考素材、模型配置和生成结果放进同一张画布，方便边做边调整。

目前以网页版和个人使用场景为主。你可以连接自己的 OpenAI-compatible 接口，也可以在本机或 Docker 中运行。

> 项目仍在开发中。本地存储格式、配置结构和部署方式可能调整，升级前请自行备份重要画布与素材。

## 你可以用它做什么

- 在画布里整理文本、图片、视频、音频和模型配置；支持连线、缩放、撤销重做、导入导出和小地图。
- 调用自己的模型接口做文生图、图生图、参考图编辑、文本问答、音频或视频生成。
- 将选中节点及其上游内容交给画布助手继续处理，并把结果放回画布。
- 用本地 Agent 连接 Codex 或 Claude Code，通过 MCP 操作当前画布。
- 安装、启用和更新远程节点插件；也可以用 TypeScript SDK 开发自己的插件。
- 保存常用提示词和图片、视频、音频、文本素材，后续直接复用。

完整范围见 [功能介绍](docs/content/docs/overview/features.mdx)。

## 开始运行

### 本地开发

```bash
cd /path/to/Visora/web
bun install
bun run dev
```

前端默认运行在 `http://localhost:3000`。

需要同时启动用户端和管理后台时，回到仓库根目录执行：

```bash
./scripts/dev-restart.sh
```

用户端端口为 `5173`，管理后台端口为 `5176`。

### Docker

从源码构建：

```bash
cd /path/to/Visora
docker compose -f docker-compose.local.yml up -d --build
```

使用已发布镜像：

```bash
cd /path/to/Visora
VISORA_IMAGE=visora:latest docker compose up -d
```

两种方式默认均通过 `http://localhost:8888` 访问。若镜像位于自己的仓库，只需将 `VISORA_IMAGE` 换成实际镜像地址。

首次使用时，请在配置页填写自己的 OpenAI-compatible `Base URL` 和 `API Key`。部分服务商的接口格式不同，可为图像和视频配置自定义调用脚本。

## 数据与接口

画布、素材、生成记录和 API 配置默认保存在浏览器本地。浏览器会按域名和端口隔离这些数据；换浏览器、换设备或换访问地址前，请先导出需要保留的内容。

模型请求由浏览器直接发往你填写的接口。请只在自己信任的设备和网络环境中保存 API Key。

## 文档入口

- [快速开始](docs/content/docs/overview/quick-start.mdx)
- [Docker 部署](docs/content/docs/overview/docker.zh-CN.mdx)
- [Render 部署](docs/content/docs/overview/render.zh-CN.mdx)
- [画布节点操作手册](docs/content/docs/canvas/canvas-node-manual.mdx)
- [画布快捷键](docs/content/docs/canvas/canvas-shortcuts.mdx)
- [画布数据结构](docs/content/docs/development/canvas-data-structure.zh-CN.mdx)
- [本地 Agent 接入规划](docs/content/docs/progress/local-agent-integration-plan.zh-CN.mdx)
- [待办事项](docs/content/docs/progress/todo.mdx)

## 许可

根目录代码使用 [MIT License](LICENSE)。复制、修改、分发或商业化部署时，请保留许可证和原版权声明。

`plugins/visora/.codex-plugin/plugin.json` 仍保留上游的 `AGPL-3.0` 声明，尚未确认其与根目录 MIT 许可证的关系。将插件单独对外分发前，请先完成许可证核对。

## 反馈

请在实际托管本项目的代码平台创建 Issue，或通过团队约定的渠道反馈问题与合作需求。
