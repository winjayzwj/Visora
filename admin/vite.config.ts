import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
    const { VISORA_API_TARGET: apiTarget } = loadEnv(mode, process.cwd(), "");

    return {
        base: "/admin/",
        plugins: [react(), tailwindcss()],
        server: {
            host: "127.0.0.1",
            // Admin 不对外：dev 时由 Web 的 Vite 把 /admin 代理到这里的内部端口。
            // 单独跑 Admin 时直接访问 http://127.0.0.1:8891/admin/。
            port: Number(process.env.VISORA_ADMIN_PORT) || 8891,
            strictPort: true,
            proxy: apiTarget
                ? {
                      "/api": {
                          target: apiTarget,
                          changeOrigin: true,
                      },
                  }
                : undefined,
        },
    };
});
