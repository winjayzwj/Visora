import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { parseChangelog } from "./src/lib/release";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";
const localChangelog = readFileSync(resolve(webDir, "../CHANGELOG.md"), "utf8");

// Expose /plugins/index.json with local plugin files from public/plugins.
// The frontend can discover and list them when enabled; development reads the directory live, while builds emit a static registry.
function localPluginsManifest(): Plugin {
    const pluginsDir = resolve(webDir, "public/plugins");
    const listLocalPlugins = () => {
        try {
            return readdirSync(pluginsDir)
                .filter((file) => file.endsWith(".js"))
                .sort()
                .map((file) => `/plugins/${file}`);
        } catch {
            return [];
        }
    };
    return {
        name: "local-plugins-manifest",
        configureServer(server) {
            server.middlewares.use("/plugins/index.json", (_req, res) => {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(listLocalPlugins()));
            });
        },
        generateBundle() {
            this.emitFile({ type: "asset", fileName: "plugins/index.json", source: JSON.stringify(listLocalPlugins()) });
        },
    };
}

// dev 时 Web 是对外入口，端口固定 8890；Admin 不再单独对外，由下面的 /admin 代理进来。
// 这样浏览器 origin 与 Docker 形态的 http://127.0.0.1:8890 保持一致，本地存储数据可以通用。
const webPort = Number(process.env.VISORA_WEB_PORT) || 8890;
const apiTarget = process.env.VISORA_API_TARGET;
const adminTarget = process.env.VISORA_ADMIN_TARGET;

function isWritableResponse(value: unknown): value is { headersSent: boolean; statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void } {
    return Boolean(value && typeof value === "object" && "headersSent" in value && "setHeader" in value && "end" in value);
}

// 代理只在显式告知目标时才创建，避免在没有后端的机器上伪装成可用服务。
const proxy = {
    ...(apiTarget
        ? {
              "/api": {
                  target: apiTarget,
                  configure(proxy: { on: (event: "error", listener: (error: Error, request: unknown, response: unknown) => void) => void }) {
                      proxy.on("error", (_error, _request, response) => {
                          if (!isWritableResponse(response) || response.headersSent) return;
                          response.statusCode = 503;
                          response.setHeader("Content-Type", "application/json; charset=utf-8");
                          response.end(JSON.stringify({ error: { code: "LOCAL_API_UNAVAILABLE", message: "本地账号服务未启动，请启动 API 服务后重试。" } }));
                      });
                  },
              },
          }
        : {}),
    // ws 必须开：Admin 的 HMR 走 WebSocket，不转发的话改后台代码不会热更新。
    ...(adminTarget ? { "/admin": { target: adminTarget, changeOrigin: true, ws: true } } : {}),
};

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react(), localPluginsManifest()],
    server: {
        host: "127.0.0.1",
        port: webPort,
        strictPort: true,
        proxy: Object.keys(proxy).length > 0 ? proxy : undefined,
    },
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
        __APP_RELEASES__: JSON.stringify(parseChangelog(localChangelog)),
    },
});
