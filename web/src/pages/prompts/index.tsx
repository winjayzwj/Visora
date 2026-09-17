import { FolderPlus, Search, X } from "lucide-react";
import { type ReactNode, type UIEvent, useEffect, useMemo, useRef, useState } from "react";
import { ComboBox, Input as HeroInput, Label, ListBox, Select } from "@heroui/react";
import { App, Button, Input, Spin } from "@/components/ui/heroui-compat";
import { useTranslation } from "react-i18next";

import { PromptCard } from "@/components/prompts/prompt-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { StudioEmptyState, StudioPageHeader } from "@/components/studio/studio-primitives";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [tagKeyword, setTagKeyword] = useState("");
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const listRef = useRef<HTMLElement>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });
    const tagOptions = useMemo(
        () =>
            Array.from(new Set([...selectedTags, ...promptTags]))
                .filter((tag) => tag !== ALL_PROMPTS_OPTION)
                .map((tag) => ({ id: tag, name: tag })),
        [promptTags, selectedTags],
    );
    const categoryOptions = Array.from(new Set([...promptCategoryOptions, selectedCategory]));
    const hasFilters = Boolean(titleKeyword || tagKeyword || selectedTags.length || selectedCategory !== ALL_PROMPTS_OPTION);

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    useEffect(() => {
        if (listRef.current) listRef.current.scrollTop = 0;
    }, [titleKeyword, selectedCategory, selectedTags]);

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success(t("common.addedToAssets"));
    };

    const handleListScroll = (event: UIEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <div className="studio-page flex h-full flex-col overflow-hidden">
            <main ref={listRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={handleListScroll}>
                <div className="studio-container">
                    <StudioPageHeader title={t("prompts.title")} icon={FolderPlus} meta={t("prompts.total", { count: totalPrompts })} />
                    <div className="min-w-0">
                            <div role="search" aria-label={t("prompts.filters")}>
                                <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,18rem)_auto]">
                                    <div className="min-w-0 space-y-2 sm:col-span-2 lg:col-span-1">
                                        <label htmlFor="prompt-search" className="studio-field-label">
                                            {t("prompts.searchLabel")}
                                        </label>
                                        <Input
                                            id="prompt-search"
                                            className="studio-search"
                                            prefix={<Search className="size-4 text-[var(--studio-muted)]" />}
                                            value={titleKeyword}
                                            placeholder={t("prompts.search")}
                                            onChange={(event) => setTitleKeyword(event.target.value)}
                                        />
                                    </div>
                                    <Select
                                        className="min-w-0"
                                        value={selectedCategory}
                                        onChange={(value) => {
                                            if (value != null) setSelectedCategory(String(value));
                                        }}
                                    >
                                        <Label className="studio-field-label">{t("prompts.category")}</Label>
                                        <Select.Trigger className="h-7 w-full min-w-0 text-xs">
                                            <Select.Value className="min-w-0 flex-1 truncate" />
                                            <Select.Indicator />
                                        </Select.Trigger>
                                        <Select.Popover className="max-h-72 max-w-[calc(100vw-32px)] overflow-y-auto overscroll-contain">
                                            <ListBox>
                                                {categoryOptions.map((category) => (
                                                    <ListBox.Item key={category} id={category} textValue={category === ALL_PROMPTS_OPTION ? t("common.all") : category}>
                                                        <span className="min-w-0 break-words">{category === ALL_PROMPTS_OPTION ? t("common.all") : category}</span>
                                                        <ListBox.ItemIndicator />
                                                    </ListBox.Item>
                                                ))}
                                            </ListBox>
                                        </Select.Popover>
                                    </Select>
                                    <ComboBox
                                        className="min-w-0"
                                        selectionMode="multiple"
                                        value={selectedTags}
                                        onChange={(values) => setSelectedTags(values.map(String))}
                                        inputValue={tagKeyword}
                                        onInputChange={setTagKeyword}
                                        defaultItems={tagOptions}
                                        allowsEmptyCollection
                                    >
                                        <Label className="studio-field-label">
                                            {t("prompts.tags")}
                                            {selectedTags.length ? ` · ${selectedTags.length}` : ""}
                                        </Label>
                                        <ComboBox.InputGroup>
                                            <HeroInput placeholder={t("prompts.searchTags")} className="h-7 min-w-0 text-xs" />
                                            <ComboBox.Trigger />
                                        </ComboBox.InputGroup>
                                        <ComboBox.Popover className="max-h-72 max-w-[calc(100vw-32px)] overflow-y-auto overscroll-contain">
                                            <ListBox renderEmptyState={() => <p className="px-3 py-4 text-sm text-muted">{t("prompts.noMatchingTags")}</p>}>
                                                {(tag: { id: string; name: string }) => (
                                                    <ListBox.Item id={tag.id} textValue={tag.name}>
                                                        <span className="min-w-0 break-words">{tag.name}</span>
                                                        <ListBox.ItemIndicator />
                                                    </ListBox.Item>
                                                )}
                                            </ListBox>
                                        </ComboBox.Popover>
                                    </ComboBox>
                                    <Button
                                        type="text"
                                        disabled={!hasFilters}
                                        className="justify-self-start lg:justify-self-end"
                                        onClick={() => {
                                            setTitleKeyword("");
                                            setTagKeyword("");
                                            setSelectedCategory(ALL_PROMPTS_OPTION);
                                            setSelectedTags([]);
                                        }}
                                    >
                                        {t("prompts.clearFilters")}
                                    </Button>
                                </div>
                                {selectedTags.length > 0 ? (
                                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--studio-border)] pt-3" aria-label={t("prompts.selectedTags")}>
                                        <span className="text-xs text-muted">{t("prompts.selectedTags")}</span>
                                        {selectedTags.map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => setSelectedTags((items) => items.filter((item) => item !== tag))}
                                                aria-label={t("prompts.removeTag", { tag })}
                                                className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md bg-accent-soft px-2.5 py-1 text-xs text-accent-soft-foreground hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                            >
                                                <span className="min-w-0 break-words text-left">{tag}</span>
                                                <X className="size-3 shrink-0" aria-hidden="true" />
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            {query.isLoading ? (
                                <div className="studio-loading mt-5 flex h-60 items-center justify-center">
                                    <Spin />
                                </div>
                            ) : null}
                            {!query.isLoading ? (
                                <div className="mt-5">
                                    <PromptGrid
                                        items={promptItems}
                                        onOpen={setSelectedPrompt}
                                        renderActions={(item) => (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button type="button" className="library-card-action" aria-label={t("common.addToAssets")} onClick={() => savePromptAsset(item)}>
                                                        <FolderPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent sideOffset={6}>{t("common.addToAssets")}</TooltipContent>
                                            </Tooltip>
                                        )}
                                        onCopy={(item) => copyText(item.prompt, t("common.promptCopied"))}
                                        emptyText={t("prompts.empty")}
                                    />
                                </div>
                            ) : null}
                            <div className="mt-6 text-center text-xs text-[var(--studio-muted)]" aria-live="polite">
                                {query.isFetchingNextPage ? t("prompts.loading") : query.hasNextPage ? t("prompts.loadMore") : promptItems.length > 0 ? t("prompts.end") : null}
                            </div>
                    </div>
                </div>
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, t("common.promptCopied"))} onSaveAsset={savePromptAsset} />
        </div>
    );
}

function PromptGrid({ items, onOpen, onCopy, renderActions, emptyText }: { items: Prompt[]; onOpen: (item: Prompt) => void; onCopy: (item: Prompt) => void; renderActions: (item: Prompt) => ReactNode; emptyText: string }) {
    return (
        <div>
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-4 xl:columns-6">
                {items.map((item) => (
                    <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => onOpen(item)} onCopy={() => onCopy(item)} extraAction={renderActions(item)} masonry />
                ))}
            </div>
            {items.length === 0 ? <StudioEmptyState title={emptyText} icon={FolderPlus} /> : null}
        </div>
    );
}
