import { BookOpen, ChevronLeft, ChevronRight, ClipboardPaste, Download, FolderPlus, History, ImagePlus, Layers, LoaderCircle, PenLine, Plus, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button as HeroButton, ButtonGroup, Card as HeroCard, Chip, ComboBox, Input as HeroInput, ListBox, Surface, Tabs } from "@heroui/react";
import { App, Image, Modal } from "@/components/ui/heroui-compat";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";

import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { StudioEmptyState, StudioPageHeader } from "@/components/studio/studio-primitives";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button as ShadcnButton } from "@/components/ui/button";
import SpecularButton from "@/components/SpecularButton";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";
import "./image-workspace.css";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed";
    images: GeneratedImage[];
    thumbnails: string[];
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "visora:image_generation_logs";
const logStore = localforage.createInstance({ name: "visora", storeName: "image_generation_logs" });

const ASPECT_RATIOS = [
    { label: "1:1", descKey: "square", size: "1024x1024", width: 1024, height: 1024 },
    { label: "16:9", descKey: "landscape", size: "1024x576", width: 1024, height: 576 },
    { label: "9:16", descKey: "portrait", size: "576x1024", width: 576, height: 1024 },
    { label: "4:3", descKey: "classic", size: "1024x768", width: 1024, height: 768 },
    { label: "3:4", descKey: "portrait", size: "768x1024", width: 768, height: 1024 },
    { label: "21:9", descKey: "widescreen", size: "1344x576", width: 1344, height: 576 },
];

const INSPIRATION_CATEGORIES = ["all", "portrait", "cyberpunk", "concept", "anime", "render3d"] as const;
const INSPIRATION_EXAMPLES = [
    { id: "exp1", category: "portrait", ratio: "3:4", image: "/studio/architecture.jpg" },
    { id: "exp2", category: "cyberpunk", ratio: "16:9", image: "/studio/landscape.jpg" },
    { id: "exp3", category: "concept", ratio: "16:9", image: "/studio/valley.jpg" },
    { id: "exp4", category: "anime", ratio: "16:9", image: "/studio/landscape.jpg" },
    { id: "exp5", category: "render3d", ratio: "1:1", image: "/studio/architecture.jpg" },
    { id: "exp6", category: "concept", ratio: "3:4", image: "/studio/valley.jpg" },
] as const;

type InspirationExample = (typeof INSPIRATION_EXAMPLES)[number] & { categoryLabel: string; title: string; tag: string; tags: string[]; prompt: string };

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const consoleRef = useRef<HTMLDivElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const themeMode = useThemeStore((state) => state.theme);
    const dark = themeMode === "dark";

    // Keep editing and text generation as separate workspace modes.
    const [activeTab, setActiveTab] = useState<"edit" | "generate">("edit");
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState<(typeof INSPIRATION_CATEGORIES)[number]>("all");
    const [inspirationDialogOpen, setInspirationDialogOpen] = useState(false);
    const [selectedInspiration, setSelectedInspiration] = useState<InspirationExample | null>(null);

    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim()) || (activeTab === "edit" && references.length > 0);
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences]);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success(t("imageWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim() || (activeTab === "edit" ? t("studio.image.agentDefaultPrompt") : "");
        if (!text && !references.length) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot(text);
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, snapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
        if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

        try {
            saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "success" : "failed",
                    images: successImages,
                }),
            );
            successCount ? message.success(t("imageWorkbench.generated")) : message.error(failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed"));
        } finally {
            setRunning(false);
        }
    };

    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const addResultToReferences = async (image: GeneratedImage) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${Date.now()}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        setActiveTab("edit");
        message.success(t("imageWorkbench.addedReference"));
        consoleRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const inspirationExamples: InspirationExample[] = INSPIRATION_EXAMPLES.map((item) => ({
        ...item,
        categoryLabel: t(`studio.image.inspirations.${item.category}`),
        title: t(`studio.image.inspirations.${item.id}.title`),
        tag: t(`studio.image.inspirations.${item.id}.tag`),
        tags: t(`studio.image.inspirations.${item.id}.tags`).split("|"),
        prompt: t(`studio.image.inspirations.${item.id}.prompt`),
    }));

    const sendResultToCanvas = (image: GeneratedImage) => {
        message.loading({ content: t("studio.image.importingToCanvas"), key: "send-canvas" });
        setTimeout(() => {
            message.success({ content: t("studio.image.importedToCanvas"), key: "send-canvas" });
            navigate("/canvas");
        }, 600);
    };

    const applyExample = (example: InspirationExample) => {
        setPrompt(example.prompt);
        const targetRatio = ASPECT_RATIOS.find((r) => r.label === example.ratio);
        if (targetRatio) {
            updateConfig("size", targetRatio.size);
        }
        message.success(t("studio.image.appliedPrompt", { title: example.title }));
        consoleRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const applyExampleAsReference = async (example: InspirationExample) => {
        setActiveTab("edit");
        setPrompt(example.prompt);
        try {
            const res = await fetch(example.image);
            const blob = await res.blob();
            const stored = await uploadImage(blob);
            setReferences((value) => [...value, { id: nanoid(), name: `${example.title}.jpg`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
            message.success(t("studio.image.referenceLoaded", { title: example.title }));
        } catch {
            message.info(t("studio.image.editModeReady"));
        }
        consoleRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
            if (activeTab === "generate") setActiveTab("edit");
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = (log: GenerationLog) => {
        void logStore.setItem(log.id, serializeLog(log)).then(refreshLogs);
    };

    const refreshLogs = async () => setLogs(await readStoredLogs());

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.references?.length) setActiveTab("edit");
        else setActiveTab("generate");
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        setResults(log.images.map((image) => ({ id: image.id, status: "success", image })));
    };

    const buildRequestSnapshot = (customText?: string) => {
        const text = (customText || prompt).trim();
        if (!text && !references.length) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        const useReferences = activeTab === "edit" ? [...references] : [];
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: useReferences };
    };

    const runGenerationSlot = async (index: number, snapshot: { text: string; config: AiConfig; references: ReferenceImage[] }) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.text, snapshot.references) : await requestGeneration(snapshot.config, snapshot.text);
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl);
            const nextImage: GeneratedImage = {
                id: image.id,
                dataUrl: stored.url,
                ...(stored.storageKey ? { storageKey: stored.storageKey } : {}),
                durationMs: performance.now() - itemStartedAt,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
            };
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        try {
            const image = await runGenerationSlot(index, snapshot);
            saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [image],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch {
            // Error handled in slot
        }
    };

    const filteredInspirations = selectedCategory === "all" ? inspirationExamples : inspirationExamples.filter((item) => item.category === selectedCategory);

    return (
        <div className="studio-page studio-workbench flex h-full min-h-0 flex-col overflow-y-auto">
            <div className="studio-container image-workbench-container">
                <StudioPageHeader
                    title={t("studio.image.title")}
                    icon={ImagePlus}
                    meta={t("studio.image.description")}
                    actions={
                        <ButtonGroup variant="tertiary" size="sm" aria-label={t("studio.resources")}>
                            <HeroButton onPress={() => setPromptDialogOpen(true)}>
                                <BookOpen className="size-3.5" />
                                {t("studio.promptLibrary")}
                            </HeroButton>
                            <HeroButton onPress={() => setAssetPickerOpen(true)}>
                                <ButtonGroup.Separator />
                                <FolderPlus className="size-3.5" />
                                {t("studio.myAssets")}
                            </HeroButton>
                            <HeroButton onPress={() => setInspirationDialogOpen(true)}>
                                <ButtonGroup.Separator />
                                <Layers className="size-3.5" />
                                {t("studio.inspiration")}
                            </HeroButton>
                        </ButtonGroup>
                    }
                />
                <div className="image-workspace">
                    <Surface className="image-workspace-controls thin-scrollbar" aria-label={t("studio.image.settings")}>
                        <div className="mb-4">
                            <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(key as "edit" | "generate")} className="w-full">
                                <Tabs.ListContainer className="w-full">
                                    <Tabs.List aria-label={t("studio.image.modes.label")} className="grid w-full grid-cols-2">
                                        <Tabs.Tab id="edit" className="justify-center gap-2">
                                            <PenLine className="size-4" />
                                            {t("studio.image.modes.edit")}
                                            <Tabs.Indicator />
                                        </Tabs.Tab>
                                        <Tabs.Tab id="generate" className="justify-center gap-2">
                                            <Sparkles className="size-4" />
                                            {t("studio.image.modes.generate")}
                                            <Tabs.Indicator />
                                        </Tabs.Tab>
                                    </Tabs.List>
                                </Tabs.ListContainer>
                            </Tabs>
                        </div>

                        <div ref={consoleRef} className="image-workspace-control-fields">
                            <div className="space-y-3">
                                <div>
                                    <div className="studio-field-label mb-2">{t("workbench.model")}</div>
                                    <ModelPicker
                                        config={effectiveConfig}
                                        value={model}
                                        capability="image"
                                        onChange={(value) => updateConfig("imageModel", value)}
                                        fullWidth
                                        className="!h-10 !rounded-xl !shadow-none"
                                        onMissingConfig={() => openConfigDialog(true)}
                                    />
                                </div>
                            </div>

                            {activeTab === "edit" && (
                                <div>
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                        <span className="studio-field-label">{t("studio.images", { count: references.length })}</span>
                                        <div className="flex items-center">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <HeroButton isIconOnly variant="tertiary" size="sm" aria-label={t("workbench.clipboard")} onPress={() => void addReferencesFromClipboard()}>
                                                        <ClipboardPaste className="size-3.5" />
                                                    </HeroButton>
                                                </TooltipTrigger>
                                                <TooltipContent>{t("studio.addFromClipboard")}</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>

                                    <div
                                        className="relative flex min-h-24 w-full flex-wrap items-center gap-2.5 rounded-lg transition-colors"
                                        style={{
                                            backgroundColor: isReferenceDragActive ? "var(--studio-accent-soft)" : undefined,
                                        }}
                                        onDragEnter={(e) => {
                                            e.preventDefault();
                                            dragDepthRef.current += 1;
                                            if (e.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={(e) => {
                                            e.preventDefault();
                                            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                                            if (!dragDepthRef.current) setIsReferenceDragActive(false);
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            dragDepthRef.current = 0;
                                            setIsReferenceDragActive(false);
                                            void addReferences(e.dataTransfer.files);
                                        }}
                                    >
                                        {references.map((item, index) => (
                                            <div key={item.id} className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-[var(--studio-border)] shadow-sm">
                                                <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                                                <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">{imageReferenceLabel(index)}</span>
                                                <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                                <HeroButton
                                                    isIconOnly
                                                    variant="danger"
                                                    size="sm"
                                                    className="absolute right-1.5 top-1.5 hidden group-hover:flex"
                                                    onPress={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                    aria-label={t("imageWorkbench.removeReference")}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </HeroButton>
                                            </div>
                                        ))}

                                        <HeroButton variant="tertiary" className="studio-reference-action" onPress={() => fileInputRef.current?.click()}>
                                            <span className="studio-reference-action-icon">
                                                <Plus className="size-4" />
                                            </span>
                                            <span>{t("studio.add")}</span>
                                        </HeroButton>
                                        <HeroButton variant="tertiary" className="studio-reference-action" onPress={() => setLogsOpen(true)}>
                                            <span className="studio-reference-action-icon">
                                                <History className="size-4" />
                                            </span>
                                            <span>{t("studio.creations")}</span>
                                        </HeroButton>
                                        {!references.length && <p className="studio-reference-drop-hint">{isReferenceDragActive ? t("studio.dropImages") : t("studio.uploadImages")}</p>}
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label htmlFor="image-workspace-prompt" className="studio-field-label">
                                        {t("workbench.prompt")}
                                    </label>
                                </div>

                                <InputGroup className="min-h-32 rounded-xl shadow-none" style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-raised)" }}>
                                    <InputGroupTextarea
                                        id="image-workspace-prompt"
                                        className="min-h-28 px-3 py-3 text-sm leading-6 text-[var(--studio-text)] placeholder:text-[var(--studio-muted)]"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        rows={activeTab === "edit" ? 3 : 4}
                                        placeholder={activeTab === "edit" ? t("studio.image.editPlaceholder") : t("imageWorkbench.promptPlaceholder")}
                                    />
                                    <InputGroupAddon align="block-end" className="flex-wrap justify-between gap-y-2 border-t border-[var(--studio-border)]">
                                        <InputGroupText className="text-xs">{t("studio.characters", { count: prompt.trim().length })}</InputGroupText>
                                        {prompt ? (
                                            <InputGroupButton variant="ghost" size="xs" onClick={() => setPrompt("")}>
                                                {t("studio.clear")}
                                            </InputGroupButton>
                                        ) : null}
                                    </InputGroupAddon>
                                </InputGroup>
                            </div>

                            <div className="grid grid-cols-2 items-end gap-3">
                                <div className="min-w-0">
                                    <div className="studio-field-label mb-2">{t("studio.image.aspectRatio")}</div>
                                    <ComboBox value={config.size} onChange={(value) => updateConfig("size", String(value))} fullWidth variant="secondary">
                                        <ComboBox.InputGroup>
                                            <HeroInput className="h-7 text-xs" placeholder={t("studio.image.selectAspectRatio")} />
                                            <ComboBox.Trigger />
                                        </ComboBox.InputGroup>
                                        <ComboBox.Popover>
                                            <ListBox>
                                                {config.size && !ASPECT_RATIOS.some((item) => item.size === config.size) ? (
                                                    <ListBox.Item id={config.size} textValue={config.size}>
                                                        {config.size}
                                                        <ListBox.ItemIndicator />
                                                    </ListBox.Item>
                                                ) : null}
                                                {ASPECT_RATIOS.map((item) => (
                                                    <ListBox.Item key={item.size} id={item.size} textValue={`${item.label} · ${t(`studio.image.ratios.${item.descKey}`)}`}>
                                                        {item.label} · {t(`studio.image.ratios.${item.descKey}`)}
                                                        <ListBox.ItemIndicator />
                                                    </ListBox.Item>
                                                ))}
                                            </ListBox>
                                        </ComboBox.Popover>
                                    </ComboBox>
                                </div>
                                <div className="min-w-0">
                                    <div className="studio-field-label mb-2">{t("studio.image.imageCount")}</div>
                                    <Tabs selectedKey={String(generationCount)} onSelectionChange={(key) => updateConfig("count", String(key))} className="w-full">
                                        <Tabs.ListContainer className="h-10 w-full">
                                            <Tabs.List aria-label={t("studio.image.imageCount")} className="grid h-full w-full grid-cols-3">
                                                {[1, 2, 4].map((num) => (
                                                    <Tabs.Tab key={num} id={String(num)} className="justify-center">
                                                        {num}
                                                        <Tabs.Indicator />
                                                    </Tabs.Tab>
                                                ))}
                                            </Tabs.List>
                                        </Tabs.ListContainer>
                                    </Tabs>
                                </div>
                            </div>

                            <div className="image-workspace-actions border-t border-[var(--studio-border)] pt-4">
                                <SpecularButton
                                    size="sm"
                                    radius={8}
                                    tint="var(--accent)"
                                    tintOpacity={1}
                                    textColor="var(--accent-foreground)"
                                    autoAnimate
                                    aria-busy={running}
                                    disabled={!canGenerate || running}
                                    onClick={() => void generate()}
                                    className="image-workspace-generate h-10 w-full !shadow-none motion-reduce:transition-none motion-reduce:active:scale-100"
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        {running ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Sparkles className="size-4" />}
                                        {running ? t("studio.image.generating", { time: formatDuration(elapsedMs) }) : activeTab === "edit" ? t("studio.image.modes.edit") : t("workbench.generate")}
                                    </span>
                                </SpecularButton>
                            </div>
                        </div>
                    </Surface>
                    <Surface className="image-workspace-preview" aria-label={t("workbench.results")}>
                        <div className="flex h-full flex-col">
                            <section className="image-workspace-stage" aria-labelledby="image-workspace-stage-title">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <h2 id="image-workspace-stage-title" className="m-0 text-base font-semibold">
                                            {results.length || running ? t("workbench.results") : t("studio.image.resultCanvas")}
                                        </h2>
                                    </div>
                                    {running ? (
                                        <Chip variant="soft" color="accent" className="font-mono">
                                            {t("studio.image.generating", { time: formatDuration(elapsedMs) })}
                                        </Chip>
                                    ) : null}
                                </div>

                                {results.length || running ? (
                                    <div className="mt-6 grid min-w-0 gap-5 sm:grid-cols-2">
                                        {results.map((result, index) =>
                                            result.status === "success" && result.image ? (
                                                <ResultImageCard key={result.id} image={result.image} index={index} onEdit={() => addResultToReferences(result.image!)} onDownload={downloadImage} onSendCanvas={() => sendResultToCanvas(result.image!)} />
                                            ) : result.status === "failed" ? (
                                                <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={() => retryResult(index)} />
                                            ) : (
                                                <PendingImageCard key={result.id} />
                                            ),
                                        )}
                                    </div>
                                ) : (
                                    <StudioEmptyState title={t("studio.image.waitingTitle")} icon={Sparkles} className="image-workspace-empty">
                                        <span>{t("studio.image.waitingDescription")}</span>
                                    </StudioEmptyState>
                                )}
                            </section>
                        </div>
                    </Surface>
                </div>
            </div>

            {/* Hidden File Input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    void addReferences(e.target.files);
                    e.target.value = "";
                }}
            />

            <Modal title={t("studio.creations")} open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null} width="80vw" styles={{ body: { minHeight: "min(70dvh, 680px)" } }}>
                <CreationGallery
                    logs={logs}
                    activeLogId={previewLog?.id}
                    onCreateSession={() => {
                        createSession();
                        setLogsOpen(false);
                    }}
                    onDelete={(id) => {
                        setSelectedLogIds([id]);
                        setDeleteConfirmOpen(true);
                    }}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Modal>

            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} onClose={() => setAssetPickerOpen(false)} onInsert={(payload) => void insertPickedAsset(payload)} />

            <Modal title={t("studio.inspiration")} open={inspirationDialogOpen} onCancel={() => setInspirationDialogOpen(false)} footer={null} width={1240}>
                <InspirationGallery
                    items={filteredInspirations}
                    selectedCategory={selectedCategory}
                    onCategoryChange={setSelectedCategory}
                    onOpen={setSelectedInspiration}
                    onApply={applyExample}
                    onUseReference={(item) => void applyExampleAsReference(item)}
                />
            </Modal>

            <InspirationDetailDialog item={selectedInspiration} onClose={() => setSelectedInspiration(null)} onApply={applyExample} onUseReference={(item) => void applyExampleAsReference(item)} />

            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onOk={deleteSelectedLogs} onCancel={() => setDeleteConfirmOpen(false)} okText={t("common.delete")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }}>
                <p>{t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}</p>
            </Modal>
        </div>
    );
}

function InspirationGallery({
    items,
    selectedCategory,
    onCategoryChange,
    onOpen,
    onApply,
    onUseReference,
}: {
    items: InspirationExample[];
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
    onOpen: (item: InspirationExample) => void;
    onApply: (item: InspirationExample) => void;
    onUseReference: (item: InspirationExample) => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="thin-scrollbar h-[min(72dvh,720px)] min-h-0 overflow-x-hidden overflow-y-auto pr-1">
            <ToggleGroup
                type="single"
                value={selectedCategory}
                onValueChange={(value) => {
                    if (value) onCategoryChange(value);
                }}
                variant="outline"
                size="sm"
                className="flex max-w-full flex-wrap"
                aria-label={t("studio.image.inspirationCategories")}
            >
                {INSPIRATION_CATEGORIES.map((category) => (
                    <ToggleGroupItem key={category} value={category}>
                        {t(`studio.image.inspirations.${category}`)}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            <div className="mt-5 columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
                {items.map((item) => (
                    <HeroCard
                        key={item.id}
                        variant="secondary"
                        className="group mb-3 min-w-0 cursor-pointer break-inside-avoid overflow-hidden outline-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus"
                        role="button"
                        tabIndex={0}
                        onClick={() => onOpen(item)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onOpen(item);
                            }
                        }}
                    >
                        <img src={item.image} alt={item.title} className="w-full object-cover" style={{ aspectRatio: item.ratio.replace(":", " /") }} loading="lazy" />
                        <HeroCard.Content className="flex flex-1 flex-col p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip size="sm" variant="soft">
                                    {item.tag}
                                </Chip>
                                <span className="text-xs text-[var(--studio-muted)]">{item.ratio}</span>
                            </div>
                            <h3 className="mt-3 line-clamp-1 text-base font-semibold text-[var(--studio-text)]">{item.title}</h3>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--studio-muted)]">{item.prompt}</p>
                            <div className="mt-4 flex items-center gap-2">
                                <HeroButton
                                    variant="secondary"
                                    size="sm"
                                    className="flex-1"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onApply(item);
                                    }}
                                >
                                    <Sparkles className="size-3.5" />
                                    {t("prompts.use")}
                                </HeroButton>
                                <HeroButton
                                    isIconOnly
                                    variant="tertiary"
                                    size="sm"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onUseReference(item);
                                    }}
                                    aria-label={t("imageWorkbench.addReference")}
                                >
                                    <PenLine className="size-3.5" />
                                </HeroButton>
                            </div>
                        </HeroCard.Content>
                    </HeroCard>
                ))}
            </div>
        </div>
    );
}

function InspirationDetailDialog({
    item,
    onClose,
    onApply,
    onUseReference,
}: {
    item: InspirationExample | null;
    onClose: () => void;
    onApply: (item: InspirationExample) => void;
    onUseReference: (item: InspirationExample) => void;
}) {
    const { t } = useTranslation();
    return (
        <Modal title={item?.title || t("studio.image.inspirationDetails")} open={Boolean(item)} onCancel={onClose} footer={null} width={1120} styles={{ body: { height: "min(76dvh, 760px)", overflow: "hidden" } }}>
            {item ? (
                <div className="grid h-full min-h-0 gap-5 md:grid-cols-[minmax(0,0.92fr)_minmax(360px,1.08fr)] md:gap-7">
                    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface-secondary p-3">
                        <img src={item.image} alt={item.title} className="min-h-0 w-full flex-1 rounded-lg object-contain" />
                        <div className="mt-3 flex items-center justify-between px-1 text-xs text-muted">
                            <span>{item.categoryLabel}</span>
                            <span className="font-mono">{item.ratio}</span>
                        </div>
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-col border-t border-border pt-5 md:border-l md:border-t-0 md:pt-0 md:pl-7">
                        <div className="shrink-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip size="sm" variant="soft">
                                    {item.tag}
                                </Chip>
                                <span className="text-sm text-muted">{item.categoryLabel}</span>
                            </div>
                            <h2 className="mt-4 text-xl font-semibold tracking-tight text-foreground">{item.title}</h2>
                        </div>
                        <div className="thin-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
                            <div className="rounded-xl border border-border bg-surface-secondary p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("studio.image.prompt")}</div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{item.prompt}</p>
                            </div>
                            <div className="mt-5">
                                <div className="text-xs font-semibold uppercase tracking-wider text-muted">{t("studio.image.categoryAndTags")}</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Chip size="sm" variant="soft">
                                        {item.categoryLabel}
                                    </Chip>
                                    {item.tags.map((tag) => (
                                        <Chip key={tag} size="sm" variant="soft">
                                            {tag}
                                        </Chip>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                            <HeroButton variant="primary" onPress={() => onApply(item)}>
                                <Sparkles className="size-4" />
                                {t("prompts.use")}
                            </HeroButton>
                            <HeroButton variant="secondary" onPress={() => onUseReference(item)}>
                                <PenLine className="size-4" />
                                {t("imageWorkbench.addReference")}
                            </HeroButton>
                        </div>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSendCanvas,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSendCanvas: (image: GeneratedImage) => void;
}) {
    const { t } = useTranslation();
    return (
        <HeroCard variant="secondary" className="group overflow-hidden">
            <AspectRatio ratio={image.width && image.height ? image.width / image.height : 1} className="overflow-hidden bg-black/40">
                <Image src={image.dataUrl} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} className="size-full object-cover" />
            </AspectRatio>

            <HeroCard.Content className="flex flex-col p-3">
                <div className="flex items-center justify-between text-xs text-[var(--studio-muted)]">
                    <span className="font-mono">
                        {image.width} × {image.height}
                    </span>
                    <span>{formatBytes(image.bytes)}</span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <ShadcnButton variant="outline" size="sm" onClick={() => onSendCanvas(image)}>
                                <Layers className="size-3.5" />
                                <span>{t("studio.image.importToCanvas")}</span>
                            </ShadcnButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("studio.image.importToCanvasHint")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <ShadcnButton variant="ghost" size="sm" onClick={() => onEdit(image, index)}>
                                <PenLine className="size-3.5" />
                                <span>{t("studio.image.editResult")}</span>
                            </ShadcnButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("studio.image.editResultHint")}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <ShadcnButton variant="ghost" size="sm" onClick={() => onDownload(image, index)}>
                                <Download className="size-3.5" />
                                <span>{t("studio.image.downloadOriginal")}</span>
                            </ShadcnButton>
                        </TooltipTrigger>
                        <TooltipContent side="top">{t("studio.image.downloadOriginalHint")}</TooltipContent>
                    </Tooltip>
                </div>
            </HeroCard.Content>
        </HeroCard>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <HeroCard variant="secondary" className="flex aspect-square flex-col items-center justify-center border-2 border-dashed p-6 text-center">
            <LoaderCircle className="mb-3 size-8 animate-spin text-[var(--studio-accent)]" />
            <span className="text-sm font-semibold text-[var(--studio-text)]">{t("workbench.generating")}</span>
            <span className="mt-1 text-xs text-[var(--studio-muted)]">{t("studio.image.sampling")}</span>
        </HeroCard>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <HeroCard variant="secondary" className="flex aspect-square flex-col items-center justify-center border-danger/30 bg-danger-soft p-6 text-center">
            <span className="text-sm font-semibold text-danger">{t("workbench.failed")}</span>
            <p className="mt-2 line-clamp-3 text-xs text-[var(--studio-muted)]">{error}</p>
            <HeroButton variant="secondary" size="sm" onPress={onRetry} className="mt-4">
                <RefreshCw className="size-3.5" />
                {t("workbench.retry")}
            </HeroButton>
        </HeroCard>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, i) => (i === index ? { ...item, ...next } : item));
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    const [current] = next.splice(index, 1);
    next.splice(target, 0, current);
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    const { t } = useTranslation();
    return (
        <div className="absolute bottom-1 left-1 hidden items-center gap-1 group-hover:flex">
            {index > 0 && (
                <HeroButton isIconOnly variant="secondary" size="sm" onPress={() => onMove(-1)} aria-label={t("studio.movePrevious")}>
                    <ChevronLeft className="size-3.5" />
                </HeroButton>
            )}
            {index < total - 1 && (
                <HeroButton isIconOnly variant="secondary" size="sm" onPress={() => onMove(1)} aria-label={t("studio.moveNext")}>
                    <ChevronRight className="size-3.5" />
                </HeroButton>
            )}
        </div>
    );
}

function CreationGallery({ logs, activeLogId, onCreateSession, onDelete, onPreviewLog }: { logs: GenerationLog[]; activeLogId?: string; onCreateSession: () => void; onDelete: (id: string) => void; onPreviewLog: (log: GenerationLog) => void }) {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-[min(70dvh,680px)] flex-col">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border)] pb-4">
                <div>
                    <p className="studio-field-label">{t("studio.image.title")}</p>
                    <p className="mt-1 text-sm text-[var(--studio-muted)]">{t("studio.creationCount", { count: logs.length })}</p>
                </div>
                <HeroButton variant="secondary" size="sm" onPress={onCreateSession}>
                    <Sparkles className="size-3.5" />
                    {t("studio.newCreation")}
                </HeroButton>
            </div>

            {logs.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {logs.map((log) => {
                        const cover = log.thumbnails[0] || log.images[0]?.dataUrl;
                        const active = log.id === activeLogId;
                        return (
                            <div key={log.id} className="group relative min-w-0">
                                <HeroButton
                                    variant="tertiary"
                                    fullWidth
                                    className={`h-auto min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-xl border p-0 text-left ${active ? "!border-[var(--studio-accent)] !bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border)]"}`}
                                    onPress={() => onPreviewLog(log)}
                                >
                                    <AspectRatio ratio={1} className="overflow-hidden bg-[var(--studio-raised)]">
                                        {cover ? (
                                            <img src={cover} alt={log.title || t("imageWorkbench.resultAlt", { count: 1 })} className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none" />
                                        ) : (
                                            <span className="grid size-full place-items-center text-[var(--studio-muted)]">
                                                <ImagePlus className="size-6" />
                                            </span>
                                        )}
                                    </AspectRatio>
                                    <span className="flex min-w-0 flex-col gap-1 p-3">
                                        <span className="line-clamp-1 text-sm font-medium text-[var(--studio-text)]">{log.title || t("studio.untitledCreation")}</span>
                                        <span className="flex items-center justify-between gap-2 text-xs text-[var(--studio-muted)]">
                                            <span className="truncate">{log.time}</span>
                                            <span className="shrink-0">{t("workbench.itemCount", { count: log.imageCount })}</span>
                                        </span>
                                    </span>
                                </HeroButton>
                                <HeroButton
                                    isIconOnly
                                    variant="tertiary"
                                    size="sm"
                                    className="absolute right-2 top-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                                    aria-label={t("studio.deleteCreation")}
                                    onPress={() => onDelete(log.id)}
                                >
                                    <Trash2 className="size-3.5" />
                                </HeroButton>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <StudioEmptyState title={t("studio.noCreations")} icon={ImagePlus} className="min-h-[360px] flex-1">
                    <span>{t("studio.noCreationsDescription")}</span>
                </StudioEmptyState>
            )}
        </div>
    );
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        thumbnails: log.images.slice(0, 4).map((i) => i.dataUrl),
    };
}

function buildLog(data: Omit<GenerationLog, "id" | "createdAt" | "time" | "imageCount" | "size" | "quality" | "title" | "thumbnails">): GenerationLog {
    return {
        ...data,
        id: nanoid(),
        createdAt: Date.now(),
        time: new Date().toLocaleTimeString(),
        title: data.prompt.slice(0, 30),
        imageCount: data.images.length,
        size: data.config.size || "1024x1024",
        quality: data.config.quality || "standard",
        thumbnails: data.images.slice(0, 4).map((i) => i.dataUrl),
    };
}

async function readStoredLogs(): Promise<GenerationLog[]> {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            values.push(value);
        });
        return values.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
        return [];
    }
}
