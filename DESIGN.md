# Visora 用户 Web 设计约定

适用 `web/`，不适用独立 `admin/`。保留 Visora Logo 与真实功能。用户明确选择 HeroUI v3 默认主题与语义色；不增加营销指标或把参考摄影当作个人作品。

## 主题

权威实现：`web/src/styles/studio.css`（全局 CSS tokens）与 `web/src/lib/canvas-theme.ts`（画布）。

| Token | Light | Dark |
| --- | --- | --- |
| 背景 | HeroUI `background` | HeroUI `background` |
| 面板 | HeroUI `surface` | HeroUI `surface` |
| 抬高层 | HeroUI `surface-secondary` | HeroUI `surface-secondary` |
| 边框 | HeroUI `border` | HeroUI `border` |
| 主文字 | HeroUI `foreground` | HeroUI `foreground` |
| 次文字 | `studio-muted`：92% `muted` + 8% `foreground` | 同一语义配比 |
| 交互强调 | HeroUI `accent` | HeroUI `accent` |
| 强调底 | HeroUI `accent-soft` | HeroUI `accent-soft` |
| 状态色 | HeroUI `success` / `warning` / `danger` | HeroUI `success` / `warning` / `danger` |

控件圆角 8px；导航高 64px；页面与导航共用 1600px 最大宽度，桌面水平内边距 32px、手机 16px，垂直内边距 24px。正文继承项目系统字体，不引入字体网络请求。导航在 xl 以下折叠为菜单，保留所有入口。页面标题使用面包屑，说明与动作放右侧，窄屏换行；内容区标题按层级使用 16–18px。

## 组件与动效

StudioPageHeader / StudioEmptyState 统一标题、动作与恢复入口。真实内容卡片使用 `studio-card`，独立工作台面板使用 `studio-panel`，两者使用 HeroUI `Surface`。搜索、筛选、工具栏与空状态直接融入页面，不另加 Surface、背景或装饰边框；父级 gap 与子级 margin 不重复堆叠。登录标题必须位于登录/注册标签上方。

界面允许 HeroUI v3 与 Shadcn 控件并存，优先复用已有 Shadcn 控件；配色统一使用 HeroUI 语义 token。只有真实 pending 状态使用持续反馈，编辑画布不放背景动画。`prefers-reduced-motion` 下关闭非必要位移反馈。

## 边界

不修改生成、存储、认证与 MongoDB；画布只变更配色，不改变坐标或节点交互。站点参考摄影来源见 `web/public/studio/sources.json`。React Bits 来源和许可见 `web/src/components/react-bits/LICENSE.md`。
