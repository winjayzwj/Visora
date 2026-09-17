import { ChevronDown, Copy, Download, Eye, PencilLine, Search, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Form, Input, Modal, Pagination, Select, Space, Tag, Typography } from "@/components/ui/heroui-compat";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { Button as HeroButton, ButtonGroup, Card, Dropdown, Tabs } from "@heroui/react";

import { StudioEmptyState, StudioPageHeader } from "@/components/studio/studio-primitives";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes, readFileAsDataUrl } from "@/lib/image-utils";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { cn } from "@/lib/utils";
import { useAssetStore, type Asset, type AssetKind, type ImageAsset } from "@/stores/use-asset-store";
import { exportAssets, readAssetPackage } from "./asset-transfer";
import "@/components/ui/card-actions.css";

type AssetFormValues = {
    kind: AssetKind;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    content?: string;
};

type ImageDraft = ImageAsset["data"] | null;

const kindOptions = ["all", "text", "image", "video"] as const;

export default function AssetsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const [form] = Form.useForm<AssetFormValues>();
    const coverInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const assetInputRef = useRef<HTMLInputElement>(null);
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const updateAsset = useAssetStore((state) => state.updateAsset);
    const removeAsset = useAssetStore((state) => state.removeAsset);
    const [keyword, setKeyword] = useState("");
    const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isAssetOpen, setIsAssetOpen] = useState(false);
    const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
    const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
    const [formKind, setFormKind] = useState<AssetKind>("text");
    const [imageDraft, setImageDraft] = useState<ImageDraft>(null);
    const coverUrl = Form.useWatch("coverUrl", form) || "";
    const title = Form.useWatch("title", form) || "";
    const content = Form.useWatch("content", form) || "";
    const validAssets = useMemo(() => assets.filter((asset) => asset.kind === "text" || asset.kind === "image" || asset.kind === "video"), [assets]);

    const filteredAssets = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return validAssets.filter((asset) => {
            if (kindFilter !== "all" && asset.kind !== kindFilter) return false;
            if (!query) return true;
            return assetSearchText(asset).includes(query);
        });
    }, [validAssets, keyword, kindFilter]);

    const visibleAssets = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredAssets.slice(start, start + pageSize);
    }, [filteredAssets, page, pageSize]);

    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
        setPage((value) => Math.min(value, maxPage));
    }, [filteredAssets.length, pageSize]);

    const openCreate = () => {
        setEditingAsset(null);
        setImageDraft(null);
        setFormKind("text");
        form.setFieldsValue({ kind: "text", title: "", coverUrl: "", tags: [], source: t("assets.manual"), note: "", content: "" });
        setIsAssetOpen(true);
    };

    const openEdit = (asset: Asset) => {
        setEditingAsset(asset);
        setFormKind(asset.kind);
        setImageDraft(asset.kind === "image" ? asset.data : null);
        form.setFieldsValue({
            kind: asset.kind,
            title: asset.title,
            coverUrl: asset.coverUrl,
            tags: asset.tags || [],
            source: asset.source,
            note: asset.note,
            content: asset.kind === "text" ? asset.data.content : "",
        });
        setIsAssetOpen(true);
    };

    const saveAsset = async () => {
        const values = await form.validateFields();
        const base = {
            title: values.title.trim(),
            coverUrl: values.coverUrl?.trim() || (values.kind === "image" && imageDraft ? imageDraft.dataUrl : ""),
            tags: values.tags || [],
            source: values.source?.trim(),
            note: values.note?.trim(),
            metadata: editingAsset?.metadata || { source: "manual" },
        };

        if (values.kind === "text") {
            const asset = { ...base, kind: "text" as const, data: { content: (values.content || "").trim() } };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        } else {
            if (!imageDraft) {
                message.error(t("assets.selectImage"));
                return;
            }
            const asset = { ...base, kind: "image" as const, data: imageDraft };
            editingAsset ? updateAsset(editingAsset.id, asset) : addAsset(asset);
        }

        message.success(editingAsset ? t("assets.updated") : t("assets.saved"));
        setIsAssetOpen(false);
    };

    const readCoverFile = async (file?: File) => {
        if (!file) return;
        const dataUrl = await readFileAsDataUrl(file);
        form.setFieldsValue({ coverUrl: dataUrl });
    };

    const readImageFile = async (file?: File) => {
        if (!file || !file.type.startsWith("image/")) return;
        const image = await uploadImage(file);
        const draft = { dataUrl: image.url, storageKey: image.storageKey, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType };
        setImageDraft(draft);
        if (!form.getFieldsValue().coverUrl) form.setFieldsValue({ coverUrl: draft.dataUrl });
        if (!form.getFieldsValue().title) form.setFieldsValue({ title: file.name });
    };

    const copyAssetText = async (asset: Asset) => {
        if (asset.kind !== "text") return;
        copyText(asset.data.content, t("assets.textCopied"));
    };

    const downloadImage = async (asset: Asset) => {
        if (asset.kind !== "image" && asset.kind !== "video") return;
        try {
            const blob = await readAssetMediaBlob(asset);
            if (!blob) {
                message.error(t("assets.downloadFailed"));
                return;
            }
            const ext = asset.data.mimeType?.split("/")[1]?.split("+")[0] || (asset.kind === "video" ? "mp4" : "png");
            saveAs(blob, `${asset.title || "asset"}.${ext}`);
        } catch {
            message.error(t("assets.downloadFailed"));
        }
    };

    const exportAllAssets = async () => {
        if (!validAssets.length) {
            message.warning(t("assets.noneToExport"));
            return;
        }
        await exportAssets(validAssets, t("assets.packageName"));
    };

    const importAssetZip = async (file?: File) => {
        if (!file) return;
        try {
            const importedAssets = await readAssetPackage(file);
            importedAssets.forEach((asset) => {
                const payload = { ...asset } as Record<string, unknown>;
                delete payload.id;
                delete payload.createdAt;
                delete payload.updatedAt;
                addAsset(payload as Parameters<typeof addAsset>[0]);
            });
            message.success(t("assets.imported", { count: importedAssets.length }));
        } catch {
            message.error(t("assets.importFailed"));
        } finally {
            if (assetInputRef.current) assetInputRef.current.value = "";
        }
    };

    const confirmDelete = () => {
        if (!deletingAsset) return;
        removeAsset(deletingAsset.id);
        message.success(t("assets.deleted"));
        setDeletingAsset(null);
    };

    return (
        <div className="studio-page flex h-full flex-col overflow-hidden">
            <main className="min-h-0 flex-1 overflow-y-auto">
                <div className="studio-container">
                    <StudioPageHeader
                        title={t("assets.title")}
                        icon={Upload}
                        meta={t("assets.description")}
                        actions={
                            <ButtonGroup variant="secondary" aria-label="资产操作">
                                <HeroButton onPress={openCreate}>
                                    <PencilLine className="size-4" />
                                    {t("assets.add")}
                                </HeroButton>
                                <Dropdown>
                                    <HeroButton isIconOnly variant="secondary" aria-label="更多资产操作">
                                        <ButtonGroup.Separator />
                                        <ChevronDown className="size-4" />
                                    </HeroButton>
                                    <Dropdown.Popover placement="bottom end">
                                        <Dropdown.Menu aria-label="更多资产操作">
                                            <Dropdown.Item id="import" textValue={t("assets.import")} onAction={() => assetInputRef.current?.click()}>
                                                <Upload className="size-4" />
                                                {t("assets.import")}
                                            </Dropdown.Item>
                                            <Dropdown.Item id="export" textValue={t("assets.export")} onAction={() => void exportAllAssets()}>
                                                <Download className="size-4" />
                                                {t("assets.export")}
                                            </Dropdown.Item>
                                        </Dropdown.Menu>
                                    </Dropdown.Popover>
                                </Dropdown>
                            </ButtonGroup>
                        }
                    />

                    <div className="min-w-0">
                            <div role="search" aria-label={t("assets.search")} className="flex flex-wrap items-center gap-3">
                                <div className="min-w-0 basis-64 flex-1 sm:max-w-md">
                                    <Input
                                        className="studio-search w-full"
                                        allowClear
                                        prefix={<Search className="size-4 text-[var(--studio-muted)]" />}
                                        value={keyword}
                                        placeholder={t("assets.search")}
                                        onChange={(event) => {
                                            setPage(1);
                                            setKeyword(event.target.value);
                                        }}
                                    />
                                </div>
                                <Tabs
                                    selectedKey={kindFilter}
                                    onSelectionChange={(key) => {
                                        setPage(1);
                                        setKindFilter(key as AssetKind | "all");
                                    }}
                                    className="min-w-0"
                                >
                                    <Tabs.ListContainer className="h-10">
                                        <Tabs.List aria-label={t("assets.type")} className="grid h-full grid-cols-4">
                                            {kindOptions.map((option) => (
                                                <Tabs.Tab key={option} id={option} className="justify-center px-3">
                                                    {option === "all" ? t("common.all") : t(`assets.kinds.${option}`)}
                                                    <Tabs.Indicator />
                                                </Tabs.Tab>
                                            ))}
                                        </Tabs.List>
                                    </Tabs.ListContainer>
                                </Tabs>
                            </div>

                            <div className="mt-5 flex flex-col gap-5">
                                {visibleAssets.length > 0 && (
                                    <div className="columns-1 gap-4 sm:columns-2 lg:columns-4 xl:columns-6">
                                        {visibleAssets.map((asset) => (
                                            <AssetCard key={asset.id} asset={asset} onOpen={() => setPreviewAsset(asset)} onEdit={() => openEdit(asset)} onCopy={copyAssetText} onDownload={downloadImage} onDelete={() => setDeletingAsset(asset)} />
                                        ))}
                                    </div>
                                )}

                                {!visibleAssets.length ? (
                                    <StudioEmptyState title={t("assets.empty")} icon={Upload}>
                                        <Button type="primary" icon={<PencilLine className="size-4" />} onClick={openCreate}>
                                            {t("assets.add")}
                                        </Button>
                                    </StudioEmptyState>
                                ) : null}

                                {filteredAssets.length > 0 && (
                                    <div className="flex justify-center">
                                        <Pagination
                                            current={page}
                                            pageSize={pageSize}
                                            total={filteredAssets.length}
                                            showSizeChanger
                                            pageSizeOptions={[10, 20, 50, 100]}
                                            onChange={(nextPage, nextPageSize) => {
                                                setPage(nextPage);
                                                setPageSize(nextPageSize);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                    </div>
                </div>
            </main>

            <Modal title={editingAsset ? t("assets.edit") : t("assets.add")} open={isAssetOpen} width="80vw" onCancel={() => setIsAssetOpen(false)} onOk={() => void saveAsset()} okText={t("common.save")} cancelText={t("common.cancel")} destroyOnHidden>
                <div className="grid min-h-[min(68dvh,680px)] gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
                    <section aria-label={t("assets.preview")} className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-secondary p-4">
                        {coverUrl || imageDraft?.dataUrl ? (
                            <img src={coverUrl || imageDraft?.dataUrl} alt={title || t("assets.untitled")} className="max-h-[40dvh] w-full rounded-xl object-contain lg:max-h-[60dvh]" />
                        ) : (
                            <div className="max-h-[40dvh] w-full overflow-y-auto rounded-xl border border-border bg-surface p-5 text-sm leading-7 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere] lg:max-h-[60dvh]">
                                {content || t("assets.noCover")}
                            </div>
                        )}
                    </section>
                    <Form form={form} className="min-h-0 min-w-0 border-t border-border pt-5 lg:max-h-[60dvh] lg:overflow-y-auto lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6" layout="vertical" requiredMark={false} initialValues={{ kind: "text", tags: [] }}>
                        <Form.Item name="kind" label={t("assets.type")}>
                            <Select
                                options={[
                                    { label: t("assets.kinds.text"), value: "text" },
                                    { label: t("assets.kinds.image"), value: "image" },
                                ]}
                                onChange={(value) => setFormKind(value)}
                            />
                        </Form.Item>
                        <Form.Item name="title" label={t("assets.fields.title")} rules={[{ required: true, message: t("assets.fields.titleRequired") }]}>
                            <Input size="large" placeholder={t("assets.fields.titlePlaceholder")} />
                        </Form.Item>
                        <Form.Item name="coverUrl" label={t("assets.fields.coverUrl")}>
                            <Space.Compact className="w-full">
                                <Input placeholder={t("assets.fields.coverPlaceholder")} />
                                <Button icon={<Upload className="size-3.5" />} onClick={() => coverInputRef.current?.click()}>
                                    {t("common.upload")}
                                </Button>
                            </Space.Compact>
                        </Form.Item>
                        <Form.Item name="tags" label={t("assets.fields.tags")}>
                            <Select mode="tags" tokenSeparators={[",", "，"]} placeholder={t("assets.fields.tagsPlaceholder")} />
                        </Form.Item>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Form.Item name="source" label={t("assets.fields.source")}>
                                <Input placeholder={t("assets.fields.sourcePlaceholder")} />
                            </Form.Item>
                            <Form.Item name="note" label={t("assets.fields.note")}>
                                <Input placeholder={t("assets.fields.optional")} />
                            </Form.Item>
                        </div>
                        {formKind === "text" ? (
                            <Form.Item name="content" label={t("assets.fields.textContent")} rules={[{ required: true, message: t("assets.fields.textRequired") }]}>
                                <Input.TextArea rows={8} placeholder={t("assets.fields.textPlaceholder")} />
                            </Form.Item>
                        ) : (
                            <Form.Item label={t("assets.fields.imageContent")} required>
                                <div className="rounded-lg border border-dashed border-border bg-surface-secondary p-4">
                                    <Button icon={<Upload className="size-4" />} onClick={() => imageInputRef.current?.click()}>
                                        {t("assets.selectImageFile")}
                                    </Button>
                                    {imageDraft ? (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {imageDraft.width}x{imageDraft.height} · {formatBytes(imageDraft.bytes)}
                                        </Typography.Text>
                                    ) : (
                                        <Typography.Text type="secondary" className="ml-3 text-xs">
                                            {t("assets.noImageSelected")}
                                        </Typography.Text>
                                    )}
                                </div>
                            </Form.Item>
                        )}
                    </Form>
                </div>
                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readCoverFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                        void readImageFile(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                />
            </Modal>

            <AssetDetailsModal asset={previewAsset} onClose={() => setPreviewAsset(null)} onCopy={copyAssetText} onDownload={downloadImage} />

            <input ref={assetInputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importAssetZip(event.target.files?.[0])} />

            <Modal title={t("assets.deleteTitle")} open={Boolean(deletingAsset)} onCancel={() => setDeletingAsset(null)} onOk={confirmDelete} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("assets.deleteConfirm", { name: deletingAsset?.title })}
            </Modal>
        </div>
    );
}

function AssetCard({ asset, onOpen, onEdit, onCopy, onDownload, onDelete }: { asset: Asset; onOpen: () => void; onEdit: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void; onDelete: () => void }) {
    const { t } = useTranslation();
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = assetSummary(asset);
    const actions = [
        { key: "view", Icon: Eye, onClick: onOpen },
        ...(asset.kind !== "video" ? [{ key: "edit", Icon: PencilLine, onClick: onEdit }] : []),
        asset.kind === "text" ? { key: "copy", Icon: Copy, onClick: () => onCopy(asset) } : { key: "download", Icon: Download, onClick: () => onDownload(asset) },
        { key: "delete", Icon: Trash2, onClick: onDelete },
    ];
    return (
        <Card className="mb-4 break-inside-avoid overflow-hidden !gap-0 !p-0 transition-colors hover:bg-surface-secondary">
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                {cover ? (
                    <img src={cover} alt={asset.title} className="h-auto w-full object-cover" loading="lazy" />
                ) : (
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--studio-raised)] p-4 text-center text-sm leading-6 text-[var(--studio-muted)]">
                        <span className="line-clamp-4 min-w-0 [overflow-wrap:anywhere]">{asset.kind === "text" ? asset.data.content : t("assets.noCover")}</span>
                    </div>
                )}
            </button>
            <Card.Content className="!gap-0">
                <button type="button" className="block w-full text-left" onClick={onOpen}>
                    <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="line-clamp-1 text-sm font-semibold text-[var(--studio-text)] [overflow-wrap:anywhere]">{asset.title}</h2>
                                <Typography.Text type="secondary" className="mt-1 block truncate text-xs">
                                    {asset.source || t("assets.unknownSource")}
                                </Typography.Text>
                            </div>
                            <Tag className="m-0 shrink-0 border-[var(--studio-border)] bg-[var(--studio-raised)] text-[11px] text-[var(--studio-muted)]">{t(`assets.kinds.${asset.kind}`)}</Tag>
                        </div>
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--studio-muted)] [overflow-wrap:anywhere]">{summary}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {(asset.tags || []).slice(0, 3).map((tag) => (
                                <Tag key={tag} title={tag} className="m-0 min-w-0 max-w-full border-[var(--studio-border)] bg-[var(--studio-raised)] text-[11px] text-[var(--studio-muted)]">
                                    <span className="truncate">{tag}</span>
                                </Tag>
                            ))}
                            {!asset.tags?.length ? <Tag className="m-0 border-[var(--studio-border)] bg-[var(--studio-raised)] text-[11px] text-[var(--studio-muted)]">{t("assets.noTags")}</Tag> : null}
                        </div>
                    </div>
                </button>
            </Card.Content>
            <TooltipProvider delayDuration={200}>
                <Card.Footer className="flex flex-wrap items-center justify-end gap-2 px-3 pb-3">
                    {actions.map(({ key, Icon, onClick }) => (
                        <Tooltip key={key}>
                            <TooltipTrigger asChild>
                                <button type="button" aria-label={t(`common.${key}`)} className={cn("library-card-action", key === "delete" && "library-card-action--danger")} onClick={onClick}>
                                    <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent sideOffset={6}>{t(`common.${key}`)}</TooltipContent>
                        </Tooltip>
                    ))}
                </Card.Footer>
            </TooltipProvider>
        </Card>
    );
}

function AssetDetailsModal({ asset, onClose, onCopy, onDownload }: { asset: Asset | null; onClose: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void }) {
    const { t } = useTranslation();
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    if (!asset) return null;

    return (
        <Modal title={t("assets.details")} open onCancel={onClose} footer={null} width="80vw" destroyOnHidden>
            <div className="grid min-h-[min(68dvh,680px)] gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
                <section className="flex min-h-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface-secondary p-4">
                    {asset.kind === "video" ? (
                        <video src={asset.data.url} controls className="max-h-[60dvh] w-full rounded-xl bg-black" />
                    ) : cover ? (
                        <img src={cover} alt={asset.title} className="max-h-[60dvh] w-full rounded-xl object-contain" />
                    ) : (
                        <div className="thin-scrollbar max-h-[60dvh] w-full overflow-y-auto rounded-xl border border-border bg-surface p-5 text-sm leading-7 text-foreground whitespace-pre-wrap">
                            {asset.kind === "text" ? asset.data.content : t("assets.noCover")}
                        </div>
                    )}
                </section>

                <aside className="thin-scrollbar min-h-0 overflow-y-auto border-t border-border pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
                    <Typography.Title level={3} className="!mb-2 break-words">
                        {asset.title}
                    </Typography.Title>
                    <Typography.Text type="secondary" className="block text-xs">
                        {asset.source || t("assets.unknownSource")}
                    </Typography.Text>

                    <div className="mt-5 flex flex-wrap gap-1.5">
                        <Tag>{t(`assets.kinds.${asset.kind}`)}</Tag>
                        {(asset.tags || []).map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                        ))}
                    </div>

                    <div className="mt-6 rounded-xl border border-border bg-surface-secondary p-4">
                        <Typography.Text type="secondary" className="block text-xs">
                            {t("assets.fields.textContent")}
                        </Typography.Text>
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "image" ? (
                            <Typography.Text className="mt-2 block text-sm">
                                {asset.data.width}x{asset.data.height} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        ) : (
                            <Typography.Text className="mt-2 block text-sm">
                                {asset.data.width}x{asset.data.height} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        )}
                    </div>

                    {asset.note ? (
                        <div className="mt-5">
                            <Typography.Text type="secondary" className="text-xs">
                                {t("assets.fields.note")}
                            </Typography.Text>
                            <Typography.Paragraph className="mt-1 whitespace-pre-wrap">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-2">
                        {asset.kind === "text" ? (
                            <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(asset)}>
                                {t("assets.copyText")}
                            </Button>
                        ) : null}
                        {asset.kind === "image" || asset.kind === "video" ? (
                            <Button type="primary" icon={<Download className="size-4" />} onClick={() => onDownload(asset)}>
                                {asset.kind === "video" ? t("assets.downloadVideo") : t("assets.downloadImage")}
                            </Button>
                        ) : null}
                    </div>
                </aside>
            </div>
        </Modal>
    );
}

async function readAssetMediaBlob(asset: Extract<Asset, { kind: "image" | "video" }>) {
    const storageKey = asset.data.storageKey;
    if (storageKey) {
        const stored = asset.kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
        if (stored) return stored;
    }
    const url = asset.kind === "video" ? asset.data.url : asset.data.dataUrl || asset.coverUrl;
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? response.blob() : null;
}

function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}
