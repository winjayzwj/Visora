import { useState } from "react";
import { Button } from "@/components/ui/heroui-compat";
import { LogOut, RefreshCw, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { canvasThemes } from "@/lib/canvas-theme";
import { usePlatformAuthStore } from "@/stores/use-platform-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";

export function PlatformAccount({ variant = "default" }: { variant?: "default" | "canvas" }) {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const user = usePlatformAuthStore((state) => state.user);
    const checking = usePlatformAuthStore((state) => state.checking);
    const loggingIn = usePlatformAuthStore((state) => state.loggingIn);
    const loggingOut = usePlatformAuthStore((state) => state.loggingOut);
    const error = usePlatformAuthStore((state) => state.error);
    const check = usePlatformAuthStore((state) => state.check);
    const logout = usePlatformAuthStore((state) => state.logout);
    const iconStyle = variant === "canvas" ? { color: theme.node.text } : undefined;
    const busy = loggingIn || loggingOut;
    const pendingLabel = loggingOut ? (checking ? "正在核对退出结果" : "正在退出登录") : loggingIn ? "正在登录" : checking ? "正在检查登录状态" : "";
    const accountLabel = pendingLabel || (user ? user.email : "登录");

    const goToLogin = () => {
        if (busy) return;
        setOpen(false);
        navigate("/login");
    };

    const signOut = async () => {
        try {
            await logout();
            setOpen(false);
        } catch {}
    };

    const toggleAccountMenu = () => {
        if (!user) {
            goToLogin();
            return;
        }
        setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen && !busy && !error) void check().catch(() => undefined);
            return nextOpen;
        });
    };

    return (
        <div className="relative">
            <button
                type="button"
                disabled={busy}
                aria-busy={busy}
                aria-expanded={user ? open : undefined}
                className="inline-flex h-7 max-w-36 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 active:scale-[.98] motion-reduce:transform-none motion-reduce:transition-none dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white"
                style={iconStyle}
                aria-label={pendingLabel || (user ? `账户：${user.email}` : "登录账户")}
                title={pendingLabel || (user ? user.email : "登录账户")}
                onClick={toggleAccountMenu}
            >
                <UserRound className="size-4 shrink-0" />
                {variant === "default" ? <span className="truncate">{accountLabel}</span> : null}
            </button>
            {user && open ? (
                <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-overlay p-2 shadow-lg" data-canvas-no-zoom>
                    <div className="px-2 py-2">
                        <div className="text-xs font-medium text-stone-500 dark:text-stone-400">{error || busy ? "上次确认的账户" : "已登录账户"}</div>
                        <div className="mt-1 truncate text-sm font-medium text-stone-950 dark:text-stone-100">{user.email}</div>
                    </div>
                    <LocalCanvasNotice />
                    <Button type="text" block className="!mt-1 !h-9 !justify-start !rounded-lg !px-2" disabled={busy} aria-busy={busy} icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
                        {busy ? pendingLabel : "退出登录"}
                    </Button>
                    {pendingLabel ? (
                        <div role="status" className="mt-2 flex items-center gap-1.5 px-2 text-xs text-stone-500 dark:text-stone-400">
                            <RefreshCw className="size-3.5 animate-spin motion-reduce:animate-none" />
                            {pendingLabel}
                        </div>
                    ) : null}
                    {error ? (
                        <div role="alert" className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs leading-5 text-amber-800 dark:text-amber-300">
                            {error.message}
                            <button type="button" disabled={busy || checking} className="ml-1.5 font-medium underline underline-offset-2 disabled:opacity-50" onClick={() => void check().catch(() => undefined)}>
                                核对会话
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function LocalCanvasNotice() {
    return <div className="rounded-md bg-stone-100 px-2 py-1.5 text-xs leading-5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">本地画布尚未绑定账号</div>;
}
