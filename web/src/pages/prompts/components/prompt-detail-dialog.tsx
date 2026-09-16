import { Copy, FileText, FolderPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Modal, Space, Tag } from "@/components/ui/heroui-compat";
import { useTranslation } from "react-i18next";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    const { i18n, t } = useTranslation();
    const imageUrls = prompt ? [prompt.coverUrl, ...prompt.referenceImageUrls.filter((url) => url !== prompt.coverUrl)].filter(Boolean) : [];
    const [imageIndex, setImageIndex] = useState(0);
    useEffect(() => setImageIndex(0), [prompt?.id, prompt?.coverUrl]);
    const imageUrl = imageUrls[imageIndex];

    return (
        <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={1080} centered styles={{ body: { height: "min(76dvh, 760px)", overflow: "hidden" } }}>
            {prompt ? (
                <div className="grid h-full min-h-0 gap-5 md:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)] md:gap-7">
                    <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-border bg-surface-secondary p-3">
                        {imageUrl ? <img src={imageUrl} alt={prompt.title} className="min-h-0 w-full flex-1 rounded-lg object-contain" onError={() => setImageIndex((index) => index + 1 < imageUrls.length ? index + 1 : -1)} /> : <div className="grid min-h-64 flex-1 place-items-center rounded-lg text-muted"><FileText className="size-9" /></div>}
                        {prompt.referenceImageUrls.length > 1 ? <div className="grid shrink-0 grid-cols-6 gap-2">{prompt.referenceImageUrls.filter((url) => url !== imageUrl).slice(0, 6).map((url) => <img key={url} src={url} alt="" className="aspect-square w-full rounded-md object-cover" loading="lazy" />)}</div> : null}
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-col border-t border-border pt-5 md:border-l md:border-t-0 md:pt-0 md:pl-7">
                        <div className="shrink-0">
                            <div className="flex flex-wrap gap-1.5"><Tag className="m-0">{prompt.category}</Tag>{prompt.tags.map((tag) => <Tag key={tag} className="m-0">{tag}</Tag>)}</div>
                            {prompt.description ? <p className="mt-4 text-sm leading-6 text-muted">{prompt.description}</p> : null}
                        </div>
                        <div className="thin-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
                            {prompt.preview ? <pre className="whitespace-pre-wrap rounded-xl border border-border bg-surface-secondary p-4 text-xs leading-5 text-muted">{prompt.preview}</pre> : null}
                            <div className="rounded-xl border border-border bg-surface-secondary p-4"><div className="text-xs font-semibold uppercase tracking-wider text-muted">提示词</div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{prompt.prompt}</p></div>
                            {prompt.createdAt || prompt.updatedAt ? <div className="mt-4 text-xs text-muted">{prompt.createdAt ? t("common.created", { date: formatPromptDate(prompt.createdAt, i18n.resolvedLanguage) }) : null}{prompt.createdAt && prompt.updatedAt ? " · " : null}{prompt.updatedAt ? t("common.updated", { date: formatPromptDate(prompt.updatedAt, i18n.resolvedLanguage) }) : null}</div> : null}
                        </div>
                    <div className="shrink-0 pt-4">
                        <Space wrap>
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                {t("common.copyPrompt")}
                            </Button>
                            {onSaveAsset ? (
                                <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                    {t("common.addToAssets")}
                                </Button>
                            ) : null}
                        </Space>
                    </div>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
