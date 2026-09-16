import { useEffect, useMemo, useState } from "react";
import { Empty, Input, Modal, Pagination, Tag } from "@/components/ui/heroui-compat";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Surface } from "@heroui/react";

import { cn } from "@/lib/utils";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";

export type InsertAssetPayload = { kind: "text"; content: string; title: string } | { kind: "image"; dataUrl: string; title: string; storageKey?: string } | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number };

type Props = {
    open: boolean;
    defaultTab?: string;
    onInsert: (payload: InsertAssetPayload) => void;
    onClose: () => void;
};

export function AssetPickerModal({ open, onInsert, onClose }: Props) {
    const { t } = useTranslation();
    return (
        <Modal title={t("canvas.assetPicker.title")} open={open} onCancel={onClose} footer={null} width="80vw" destroyOnHidden styles={{ body: { padding: "0 28px 28px" } }}>
            <MyAssetsTab onInsert={onInsert} />
        </Modal>
    );
}

const PAGE_SIZE = 15;

const kindOptions = ["all", "text", "image", "video"];

function PickerCard({ asset, onClick }: { asset: Asset; onClick: () => void }) {
    const { t } = useTranslation();
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = asset.note || (asset.kind === "text" ? asset.data.content : `${asset.data.width} × ${asset.data.height}`);
    return (
        <Surface className="studio-card overflow-hidden rounded-lg border transition-colors hover:bg-[var(--studio-raised)]">
            <button type="button" className="group relative block w-full cursor-pointer overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40" onClick={onClick}>
                {cover ? (
                    <img src={cover} alt={asset.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                ) : (
                    <div className="flex aspect-[4/3] items-center justify-center bg-surface-secondary p-3 text-center text-xs leading-5 text-muted">{asset.title}</div>
                )}
                <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                        <span title={asset.title} className="line-clamp-1 min-w-0 text-xs font-medium text-foreground">{asset.title}</span>
                        <Tag className="m-0 shrink-0 text-[10px]">{t(`assets.kinds.${asset.kind}`)}</Tag>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted [overflow-wrap:anywhere]">{summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span title={asset.source || t("assets.unknownSource")} className="max-w-full truncate text-[10px] text-muted">{asset.source || t("assets.unknownSource")}</span>
                        {asset.tags.slice(0, 2).map((tag) => <Tag key={tag} title={tag} className="m-0 max-w-full text-[10px]"><span className="truncate">{tag}</span></Tag>)}
                        {asset.tags.length > 2 ? <span className="text-[10px] text-muted">+{asset.tags.length - 2}</span> : null}
                    </div>
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-black/55 group-hover:opacity-100">{t("canvas.assetPicker.insert")}</div>
            </button>
        </Surface>
    );
}

function MyAssetsTab({ onInsert }: { onInsert: (payload: InsertAssetPayload) => void }) {
    const { t } = useTranslation();
    const assets = useAssetStore((state) => state.assets);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState("all");
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return assets
            .filter((a) => a.kind === "text" || a.kind === "image" || a.kind === "video")
            .filter((a) => kindFilter === "all" || a.kind === kindFilter)
            .filter((a) => !query || [a.title, ...(a.tags || [])].join(" ").toLowerCase().includes(query));
    }, [assets, keyword, kindFilter]);

    const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        setPage((v) => Math.min(v, maxPage));
    }, [filtered.length]);

    const handleInsert = (asset: Asset) => {
        if (asset.kind === "text") {
            onInsert({ kind: "text", content: asset.data.content, title: asset.title });
        } else {
            onInsert(asset.kind === "video" ? { kind: "video", url: asset.data.url, storageKey: asset.data.storageKey, title: asset.title, width: asset.data.width, height: asset.data.height } : { kind: "image", dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey, title: asset.title });
        }
    };

    return (
        <div className="grid h-[min(72dvh,760px)] min-h-0 gap-8 py-2 sm:grid-cols-[190px_minmax(0,1fr)]">
            <aside className="thin-scrollbar min-w-0 overflow-y-auto border-b border-border pb-4 sm:border-r sm:border-b-0 sm:pb-0 sm:pr-5">
                <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">{t("assets.type")}</div>
                <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-stretch">
                    {kindOptions.map((option) => (
                        <Tag.CheckableTag
                            key={option}
                            checked={kindFilter === option}
                            className={cn("justify-start", "prompt-filter-tag", kindFilter === option && "is-active")}
                            onChange={() => {
                                setPage(1);
                                setKindFilter(option);
                            }}
                        >
                            {option === "all" ? t("common.all") : t(`assets.kinds.${option}`)}
                        </Tag.CheckableTag>
                    ))}
                </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col">
                <Input
                    className="w-full"
                    size="small"
                    prefix={<Search className="size-3.5 text-muted" />}
                    placeholder={t("canvas.assetPicker.search")}
                    value={keyword}
                    allowClear
                    onChange={(e) => {
                        setPage(1);
                        setKeyword(e.target.value);
                    }}
                />

                <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                    {visible.length ? (
                        <div className="columns-1 gap-4 sm:columns-2 lg:columns-5">
                            {visible.map((asset) => (
                                <div key={asset.id} className="mb-4 break-inside-avoid">
                                    <PickerCard asset={asset} onClick={() => handleInsert(asset)} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.assetPicker.empty")} className="h-full py-12" />
                    )}
                </div>

                {filtered.length > PAGE_SIZE && (
                    <div className="mt-4 flex justify-center">
                        <Pagination size="small" current={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} showSizeChanger={false} />
                    </div>
                )}
            </section>
        </div>
    );
}
