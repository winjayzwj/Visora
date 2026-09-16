import { Search } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Empty, Modal, Spin, Tag } from "@/components/ui/heroui-compat";
import { useTranslation } from "react-i18next";

import { ALL_PROMPTS_OPTION } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { PromptCard } from "./prompt-card";
import { usePromptList } from "./use-prompt-list";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (prompt: string) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
    const { query, items, tags: promptTags, categories: promptCategories } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, enabled: open });
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };
    const selectPrompt = (prompt: string) => {
        onSelect(prompt);
        onOpenChange(false);
    };

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <>
        <Modal title={t("prompts.library")} open={open} onCancel={() => onOpenChange(false)} footer={null} width="80vw" centered>
            <div className="grid h-[min(72dvh,720px)] min-h-0 gap-8 py-2 sm:grid-cols-[240px_minmax(0,1fr)]" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <aside className="thin-scrollbar min-w-0 overflow-x-hidden overflow-y-auto border-r border-border pr-5">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{t("prompts.category")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {promptCategories.map((category) => (
                            <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("max-w-full whitespace-normal break-words text-left", "prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                <span className="block max-w-full">{category === ALL_PROMPTS_OPTION ? t("common.all") : category}</span>
                            </Tag.CheckableTag>
                        ))}
                    </div>
                    <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-muted">{t("prompts.tags")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {promptTags.map((tag) => {
                            const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                            return (
                                <Tag.CheckableTag key={tag} checked={active} className={cn("max-w-full whitespace-normal break-words text-left", "prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>
                                    <span className="block max-w-full">{tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}</span>
                                </Tag.CheckableTag>
                            );
                        })}
                    </div>
                </aside>
                <section className="flex min-h-0 min-w-0 flex-col">
                    <InputGroup className="h-10 rounded-xl shadow-none" style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-raised)" }}>
                        <InputGroupAddon><Search className="size-4 text-muted" /></InputGroupAddon>
                        <InputGroupInput value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t("prompts.searchTitle")} />
                    </InputGroup>
                    <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                        {query.isLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <Spin />
                            </div>
                        ) : null}
                        <div className="columns-1 gap-4 sm:columns-3 lg:columns-5">
                            {items.map((item) => (
                                <PromptCard key={item.id} item={item} onOpen={() => selectPrompt(item.prompt)} onCopy={() => selectPrompt(item.prompt)} onPreview={(src, alt) => setPreviewImage({ src, alt })} compact masonry />
                            ))}
                        </div>
                        {!query.isLoading && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("prompts.empty")} className="py-8" /> : null}
                        {query.isFetchingNextPage ? (
                            <div className="py-4 text-center">
                                <Spin size="small" />
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>
        </Modal>
        <Modal title="提示词图片预览" open={Boolean(previewImage)} onCancel={() => setPreviewImage(null)} footer={null} width="80vw">
            {previewImage ? (
                <div className="grid h-[min(72dvh,760px)] min-h-0 gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
                    <figure className="flex min-h-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-secondary p-4">
                        <img src={previewImage.src} alt={previewImage.alt} className="max-h-[64dvh] w-full object-contain" />
                    </figure>
                    <aside className="border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                        <div className="text-xs font-semibold uppercase tracking-widest text-muted">提示词图片</div>
                        <p className="mt-3 break-words text-sm leading-6 text-foreground">{previewImage.alt}</p>
                    </aside>
                </div>
            ) : null}
        </Modal>
        </>
    );
}
