import { Copy, FileText } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Tag } from "@/components/ui/heroui-compat";
import { useTranslation } from "react-i18next";
import { Card } from "@heroui/react";

import { cn } from "@/lib/utils";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import "@/components/ui/card-actions.css";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    actionLabel,
    actionIcon = <Copy className="size-4" strokeWidth={1.75} />,
    actionType = "text",
    extraAction,
    compact = false,
    masonry = false,
    onPreview,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
    compact?: boolean;
    masonry?: boolean;
    onPreview?: (src: string, alt: string) => void;
}) {
    const { i18n, t } = useTranslation();
    const imageUrls = [item.coverUrl, ...item.referenceImageUrls.filter((url) => url !== item.coverUrl)].filter(Boolean);
    const [imageIndex, setImageIndex] = useState(0);
    useEffect(() => setImageIndex(0), [item.id, item.coverUrl]);
    const imageUrl = imageUrls[imageIndex];
    const imageClassName = masonry ? "w-full object-cover" : "aspect-[4/3] w-full object-cover";
    const imageFallback = (
        <span className={cn("grid w-full place-items-center bg-surface-secondary text-muted", masonry ? "min-h-36" : "aspect-[4/3]")}>
            <FileText className="size-8" />
        </span>
    );
    return (
        <Card
            className={cn(
                "!gap-0 !p-0 transition-colors hover:bg-surface-secondary",
                compact ? cn("cursor-pointer overflow-hidden", masonry && "mb-4 break-inside-avoid") : masonry ? "mb-4 break-inside-avoid overflow-hidden" : "flex h-full flex-col overflow-hidden",
            )}
        >
            <button type="button" className="block w-full cursor-pointer text-left" onClick={() => (imageUrl && onPreview ? onPreview(imageUrl, item.title) : onOpen())}>
                {imageUrl ? <img src={imageUrl} alt={item.title} className={imageClassName} loading="lazy" onError={() => setImageIndex((index) => (index + 1 < imageUrls.length ? index + 1 : -1))} /> : imageFallback}
            </button>
            <Card.Content className="!gap-0">
                <button type="button" className={compact ? "block w-full cursor-pointer text-left" : "block w-full flex-1 cursor-pointer text-left"} onClick={onOpen}>
                    <div className={compact ? "px-3 py-3" : "p-4"}>
                        <div className="min-w-0">
                            <h2 title={item.title} className={cn("line-clamp-1 font-semibold text-[var(--studio-text)] [overflow-wrap:anywhere]", compact ? "text-xs" : "text-sm")}>
                                {item.title}
                            </h2>
                            {!compact ? <span className="mt-1 block text-xs text-[var(--studio-muted)]">{formatPromptDate(item.updatedAt, i18n.resolvedLanguage)}</span> : null}
                        </div>
                        {compact ? (
                            <>
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--studio-muted)] [overflow-wrap:anywhere]">{item.description || item.prompt}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                    <span className="max-w-full truncate text-[11px] text-[var(--studio-muted)]">{item.category}</span>
                                    {item.tags.slice(0, 2).map((tag) => (
                                        <Tag key={tag} title={tag} className="m-0 min-w-0 max-w-full border-[var(--studio-border)] bg-[var(--studio-raised)] text-[10px] text-[var(--studio-muted)]">
                                            <span className="truncate">{tag}</span>
                                        </Tag>
                                    ))}
                                    {item.tags.length > 2 ? <span className="text-[10px] text-[var(--studio-muted)]">+{item.tags.length - 2}</span> : null}
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--studio-muted)] [overflow-wrap:anywhere]">{item.description || item.prompt}</p>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {item.tags.slice(0, 3).map((tag) => (
                                        <Tag key={tag} title={tag} className="m-0 min-w-0 max-w-full border-[var(--studio-border)] bg-[var(--studio-raised)] text-[11px] text-[var(--studio-muted)]">
                                            <span className="truncate">{tag}</span>
                                        </Tag>
                                    ))}
                                    {item.tags.length > 3 ? <span className="self-center text-xs text-[var(--studio-muted)]">+{item.tags.length - 3}</span> : null}
                                </div>
                            </>
                        )}
                    </div>
                </button>
            </Card.Content>
            {!compact ? (
                <TooltipProvider delayDuration={200}>
                    <Card.Footer className="mt-auto flex flex-wrap items-center justify-end gap-2 px-3 pb-3">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button type="button" aria-label={actionLabel || t("common.copy")} className={cn("library-card-action", actionType === "primary" && "!bg-accent !text-accent-foreground")} onClick={onCopy}>
                                    <span aria-hidden="true">{actionIcon}</span>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>{actionLabel || t("common.copy")}</TooltipContent>
                        </Tooltip>
                        {extraAction}
                    </Card.Footer>
                </TooltipProvider>
            ) : null}
        </Card>
    );
}
