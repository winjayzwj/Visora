import { Button, Drawer } from "@heroui/react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const { t } = useTranslation();

    return (
        <Drawer.Backdrop
            isOpen={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <Drawer.Content placement="left">
                <Drawer.Dialog>
                    <Drawer.Header className="!flex-row items-center justify-between gap-4">
                        <Drawer.Heading>{t("topNav.navigation")}</Drawer.Heading>
                        <Button slot="close" isIconOnly variant="tertiary" aria-label="关闭弹窗" className="size-7 min-w-7 min-h-7 !rounded-lg !p-0">
                            <X className="size-4" strokeWidth={1.75} />
                        </Button>
                    </Drawer.Header>
                    <Drawer.Body>
                        <div className="space-y-1">
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link key={tool.slug} to={`/${tool.slug}`} onClick={onClose} aria-current={active ? "page" : undefined} className={cn("studio-mobile-link", active && "font-medium")}>
                                        <Icon className="size-5" />
                                        <span>{t(`navigation.${tool.slug}`)}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </Drawer.Body>
                </Drawer.Dialog>
            </Drawer.Content>
        </Drawer.Backdrop>
    );
}
