import { useState } from "react";
import { Button as HeroButton } from "@heroui/react";
import { UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { usePlatformAuthStore } from "@/stores/use-platform-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { PlatformAccountDrawer } from "./platform-account-drawer";

export function PlatformAccount({ variant = "default", className }: { variant?: "default" | "canvas"; className?: string }) {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const user = usePlatformAuthStore((state) => state.user);
    const checking = usePlatformAuthStore((state) => state.checking);
    const loggingIn = usePlatformAuthStore((state) => state.loggingIn);
    const registering = usePlatformAuthStore((state) => state.registering);
    const loggingOut = usePlatformAuthStore((state) => state.loggingOut);
    const iconStyle = variant === "canvas" ? { color: theme.node.text } : undefined;
    const busy = loggingIn || registering || loggingOut;
    const pendingLabel = loggingOut ? (checking ? "正在核对退出结果" : "正在退出登录") : loggingIn ? "正在登录" : registering ? "正在创建账户" : "";

    const goToLogin = () => {
        if (busy) return;
        setOpen(false);
        navigate("/login");
    };

    const toggleAccountMenu = () => {
        if (!user) {
            goToLogin();
            return;
        }
        setOpen((current) => !current);
    };

    return (
        <>
            <HeroButton
                isIconOnly
                variant="tertiary"
                size="sm"
                isDisabled={busy}
                aria-busy={busy}
                aria-expanded={user ? open : undefined}
                className={cn("shrink-0 text-muted hover:text-foreground", className)}
                style={iconStyle}
                aria-label={pendingLabel || (user ? `账户：${user.email}` : "登录账户")}
                title={pendingLabel || (user ? user.email : "登录账户")}
                onPress={toggleAccountMenu}
            >
                <UserRound className="size-4 shrink-0" />
            </HeroButton>
            {user ? <PlatformAccountDrawer open={open} onClose={() => setOpen(false)} /> : null}
        </>
    );
}
