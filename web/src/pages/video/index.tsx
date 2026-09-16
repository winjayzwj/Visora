import { ArrowLeft, ArrowRight, BookOpen, ClipboardPaste, Download, FolderPlus, History, LoaderCircle, Plus, SlidersHorizontal, Sparkles, Trash2, Upload, VideoIcon } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Button as HeroButton, Surface } from "@heroui/react";
import { App, Button, Drawer, Modal, Tag, Typography } from "@/components/ui/heroui-compat";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { StudioEmptyState, StudioPageHeader } from "@/components/studio/studio-primitives";
import { Button as ShadcnButton } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VideoSettingsPanel, normalizeVideoResolutionValue, normalizeVideoSizeValue, videoModeLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { clampVideoSeconds } from "@/lib/media-size";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { deleteStoredMedia, resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { boolConfig, modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    video?: GeneratedVideo;
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
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoMode">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "visora:video_generation_logs";
const logStore = localforage.createInstance({ name: "visora", storeName: "video_generation_logs" });

export default function VideoPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.videoModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/"));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, 7 - references.length);
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, 7));
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(true);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(false);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(false);
        void addReferences(event.dataTransfer.files);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("videoWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, 7 - references.length).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, 7));
            message.success(t("videoWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("videoWorkbench.clipboardEmpty"));
        }
    };
    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults([{ id: nanoid(), status: "pending" }]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        try {
            const task = await createVideoGenerationTask(snapshot.config, snapshot.text, snapshot.references);
            const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, durationMs: 0, status: "pending", task });
            await saveLog(log, false);
            void pollGenerationLog(log, snapshot.config, agentTaskId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: nanoid(), status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog(buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, durationMs: performance.now() - batchStartedAt, status: "failed", error: errorMessage }));
            message.error(errorMessage);
            setRunning(false);
        }
    };

    // Handle video-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: t("videoWorkbench.busy") });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: [...references] };
    };

    const retryResult = () => {
        void generate();
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (video: GeneratedVideo) => {
        addAsset({
            kind: "video",
            title: t("videoWorkbench.resultTitle"),
            coverUrl: "",
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, 7));
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
        const mediaKeys = logs
            .filter((log) => selectedLogIds.includes(log.id))
            .map((log) => log.video?.storageKey)
            .filter((key): key is string => Boolean(key));
        void Promise.all([deleteStoredMedia(mediaKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(() => refreshLogs());
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        await logStore.setItem(log.id, serializeLog(log));
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true) => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        if (resumePending) resumePendingLogs(nextLogs);
        return nextLogs;
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if (log.status === "pending" && log.task) void pollGenerationLog(log);
        }
    };

    const pollGenerationLog = async (log: GenerationLog, configOverride?: AiConfig, agentTaskId?: string) => {
        if (!log.task || activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        setRunning(true);
        setStartedAt((value) => value || performance.now());
        setResults((value) => (value.length ? value : [{ id: log.id, status: "pending" }]));
        const taskConfig = buildVideoConfig({ ...effectiveConfig, ...log.config }, log.task.model || log.model);
        try {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const state = await pollVideoGenerationTask(configOverride || taskConfig, log.task);
                if (state.status === "completed") {
                    const stored = await storeGeneratedVideo(state.result);
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: Date.now() - log.createdAt,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults([{ id: nextVideo.id, status: "success", video: nextVideo }]);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog({ ...log, status: "success", durationMs: nextVideo.durationMs, video: nextVideo, error: undefined });
                    message.success(t("videoWorkbench.generated"));
                    return;
                }
                if (state.status === "failed") throw new Error(state.error);
                if (attempt === 119) throw new Error(t("videoWorkbench.timeout"));
                await delay(2500);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: log.id, status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog({ ...log, status: "failed", durationMs: Date.now() - log.createdAt, error: errorMessage });
            message.error(errorMessage);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            if (!activeLogIdsRef.current.size) {
                setRunning(false);
                setStartedAt(0);
            }
        }
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        if (log.config.videoMode) updateConfig("videoMode", log.config.videoMode);
        setResults(log.status === "pending" ? [{ id: log.id, status: "pending" }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed") }]);
    };

    return (
        <div className="studio-page studio-workbench flex h-full min-h-0 flex-col overflow-hidden">
            <div className="studio-container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <StudioPageHeader
                    title={t("videoWorkbench.title")}
                    icon={VideoIcon}
                    meta="从提示词或图片开始创作"
                    actions={
                        <div className="lg:hidden">
                            <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                {t("workbench.settings")}
                            </Button>
                        </div>
                    }
                />
                <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                    <section className="grid min-w-0 gap-5 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(390px,420px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
                        <Surface className="studio-panel thin-scrollbar flex min-w-0 flex-col p-5 lg:min-h-0 lg:overflow-y-auto">
                            <div className="min-w-0 space-y-4">
                                <div className="min-w-0">
                                    <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <label htmlFor="video-workspace-prompt" className="studio-field-label shrink-0">{t("workbench.prompt")}</label>
                                    </div>
                                    <InputGroup className="min-h-32 rounded-xl shadow-none" style={{ borderColor: "var(--studio-border)", backgroundColor: "var(--studio-raised)" }}>
                                        <InputGroupTextarea
                                            id="video-workspace-prompt"
                                            className="min-h-28 px-3 py-3 text-sm leading-6 text-[var(--studio-text)] placeholder:text-[var(--studio-muted)]"
                                            value={prompt}
                                            onChange={(event) => setPrompt(event.target.value)}
                                            rows={4}
                                            placeholder={t("videoWorkbench.promptPlaceholder")}
                                        />
                                        <InputGroupAddon align="block-end" className="flex-wrap justify-between gap-y-2 border-t border-[var(--studio-border)]">
                                            <InputGroupText className="text-xs">{prompt.trim().length} 字</InputGroupText>
                                            <div className="flex min-w-0 flex-wrap items-center gap-1">
                                                <InputGroupButton variant="ghost" size="xs" onClick={() => setPromptDialogOpen(true)}>
                                                    <BookOpen className="size-3.5" />提示词库
                                                </InputGroupButton>
                                                <InputGroupButton variant="ghost" size="xs" onClick={() => setAssetPickerOpen(true)}>
                                                    <FolderPlus className="size-3.5" />我的资产
                                                </InputGroupButton>
                                                {prompt ? <InputGroupButton variant="ghost" size="xs" onClick={() => setPrompt("")}>清空</InputGroupButton> : null}
                                            </div>
                                        </InputGroupAddon>
                                    </InputGroup>
                                </div>

                                <div className="min-w-0">
                                    <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <span className="studio-field-label shrink-0">图片 ({references.length})</span>
                                        <div className="flex min-w-0 max-w-full flex-wrap justify-end">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <HeroButton isIconOnly variant="tertiary" size="sm" aria-label={t("workbench.clipboard")} onPress={() => void addReferencesFromClipboard()}><ClipboardPaste className="size-3.5" /></HeroButton>
                                                </TooltipTrigger>
                                                <TooltipContent>从剪贴板添加图片</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <div
                                        className="relative flex min-h-24 w-full flex-wrap items-center gap-2.5 rounded-lg transition-colors"
                                        style={{ backgroundColor: referenceDragTarget ? "var(--studio-accent-soft)" : undefined }}
                                        onDragEnter={handleReferenceDragEnter}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            event.dataTransfer.dropEffect = "copy";
                                        }}
                                        onDragLeave={handleReferenceDragLeave}
                                        onDrop={handleReferenceDrop}
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
                                                    aria-label={t("videoWorkbench.removeImage")}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </HeroButton>
                                            </div>
                                        ))}
                                        <HeroButton variant="tertiary" className="studio-reference-action" onPress={() => fileInputRef.current?.click()}>
                                            <span className="studio-reference-action-icon"><Plus className="size-4" /></span>
                                            <span>添加</span>
                                        </HeroButton>
                                        <HeroButton variant="tertiary" className="studio-reference-action" onPress={() => setLogsOpen(true)}>
                                            <span className="studio-reference-action-icon"><History className="size-4" /></span>
                                            <span>我的创作</span>
                                        </HeroButton>
                                        {!references.length && <p className="studio-reference-drop-hint">{referenceDragTarget ? "松开鼠标添加图片" : "拖拽或点击上传 JPG、PNG 或 WEBP 图片"}</p>}
                                    </div>
                                </div>

                                <div className="studio-field flex min-w-0 items-center justify-between rounded-lg border border-[var(--studio-border)] bg-[var(--studio-raised)] px-3 py-2 text-sm sm:hidden">
                                    <span className="min-w-0 flex-1 truncate text-[var(--studio-muted)]">
                                        {modelOptionLabel(effectiveConfig, model)} · {normalizeResolution(effectiveConfig.vquality)}p · {videoSizeLabel(effectiveConfig.size)} · {normalizeVideoSeconds(effectiveConfig.videoSeconds)}s ·{" "}
                                        {videoModeLabel(effectiveConfig.videoMode)}
                                    </span>
                                    <Button className="shrink-0" size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        {t("workbench.adjust")}
                                    </Button>
                                </div>

                                <div className="hidden min-w-0 gap-4 sm:grid sm:grid-cols-2">
                                    <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                                </div>
                            </div>

                            <div className="mt-auto pt-4">
                                <ShadcnButton size="lg" className="h-10 w-full" aria-busy={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                                    {running ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Sparkles className="size-4" />}
                                    {running ? t("workbench.generating") : t("workbench.generate")}
                                </ShadcnButton>
                            </div>
                        </Surface>

                        <Surface className="studio-panel thin-scrollbar flex min-w-0 flex-col p-5 lg:min-h-0 lg:overflow-y-auto">
                            <div className="studio-toolbar mb-4 justify-between gap-3">
                                <h2 className="studio-section-title">{t("workbench.results")}</h2>
                                {running ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                            </div>
                            {results.length ? (
                                <div className="grid min-w-0 gap-4">
                                    {results.map((result) =>
                                        result.status === "success" && result.video ? (
                                            <ResultVideoCard key={result.id} video={result.video} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} />
                                        ) : result.status === "failed" ? (
                                            <FailedVideoCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={retryResult} />
                                        ) : (
                                            <PendingVideoCard key={result.id} />
                                        ),
                                    )}
                                </div>
                            ) : (
                                <StudioEmptyState title={t("videoWorkbench.empty")} icon={VideoIcon} className="min-w-0 flex-1" />
                            )}
                        </Surface>
                    </section>
                </main>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        void addReferences(event.target.files);
                        event.target.value = "";
                    }}
                />
                <Modal title="我的创作" open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null} width="80vw" styles={{ body: { minHeight: "min(70dvh, 680px)" } }}>
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
                        onPreviewLog={previewGenerationLog}
                    />
                </Modal>
                <Drawer title={t("workbench.settings")} placement="bottom" height="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                    <div className="grid min-w-0 grid-cols-2 gap-3 pb-4">
                        <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                    </div>
                </Drawer>
                <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
                <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
                <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                    {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
                </Modal>
            </div>
        </div>
    );
}

function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();

    return (
        <>
            <label className="col-span-2 block min-w-0">
                <span className="studio-field-label mb-2">{t("workbench.model")}</span>
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("videoModel", value)} capability="video" fullWidth className="!h-10 !rounded-xl !shadow-none" onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <div className="col-span-2 min-w-0">
                <VideoSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" />
            </div>
        </>
    );
}

function ResultVideoCard({ video, onDownload, onSaveAsset }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const { t } = useTranslation();
    return (
        <Surface className="studio-card min-w-0 overflow-hidden rounded-lg border">
            <AspectRatio ratio={video.width && video.height ? video.width / video.height : 16 / 9} className="bg-black">
                <video src={video.url} controls className="size-full object-contain" />
            </AspectRatio>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--studio-border)] px-3 py-2.5">
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--studio-muted)]">
                    <span>
                        {video.width}x{video.height}
                    </span>
                    <span>{formatBytes(video.bytes)}</span>
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        {t("common.addToAssets")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        </Surface>
    );
}

function PendingVideoCard() {
    const { t } = useTranslation();
    return (
        <Surface className="studio-card studio-loading relative aspect-video overflow-hidden rounded-lg border border-dashed !bg-[var(--studio-raised)]">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-[var(--studio-muted)]">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </Surface>
    );
}

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <Surface className="min-w-0 overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </Surface>
    );
}

function CreationGallery({ logs, activeLogId, onCreateSession, onDelete, onPreviewLog }: {
    logs: GenerationLog[];
    activeLogId?: string;
    onCreateSession: () => void;
    onDelete: (id: string) => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    return (
        <div className="flex min-h-[min(70dvh,680px)] flex-col">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--studio-border)] pb-4">
                <div>
                    <p className="studio-field-label">视频生成</p>
                    <p className="mt-1 text-sm text-[var(--studio-muted)]">共 {logs.length} 项创作</p>
                </div>
                <HeroButton variant="secondary" size="sm" onPress={onCreateSession}>
                    <Sparkles className="size-3.5" />新建创作
                </HeroButton>
            </div>

            {logs.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {logs.map((log) => {
                        const active = log.id === activeLogId;
                        const status = log.status === "success" ? "已完成" : log.status === "pending" ? "生成中" : "生成失败";
                        return (
                            <div key={log.id} className="group relative min-w-0">
                                <HeroButton
                                    variant="tertiary"
                                    fullWidth
                                    className={`h-auto min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-xl border p-0 text-left ${active ? "!border-[var(--studio-accent)] !bg-[var(--studio-accent-soft)]" : "border-[var(--studio-border)]"}`}
                                    onPress={() => onPreviewLog(log)}
                                >
                                    <AspectRatio ratio={16 / 9} className="overflow-hidden bg-[var(--studio-raised)]">
                                        {log.video ? <video src={log.video.url} className="size-full object-cover" muted preload="metadata" /> : <span className="grid size-full place-items-center text-[var(--studio-muted)]">{log.status === "pending" ? <LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" /> : <VideoIcon className="size-6" />}</span>}
                                    </AspectRatio>
                                    <span className="flex min-w-0 flex-col gap-1 p-3">
                                        <span className="line-clamp-1 text-sm font-medium text-[var(--studio-text)]">{log.title || "未命名创作"}</span>
                                        <span className="flex items-center justify-between gap-2 text-xs text-[var(--studio-muted)]"><span className="truncate">{log.time}</span><span className="shrink-0">{status}</span></span>
                                    </span>
                                </HeroButton>
                                <HeroButton isIconOnly variant="tertiary" size="sm" className="absolute right-2 top-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100" aria-label="删除创作记录" onPress={() => onDelete(log.id)}>
                                    <Trash2 className="size-3.5" />
                                </HeroButton>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <StudioEmptyState title="还没有创作" icon={VideoIcon} className="min-h-[360px] flex-1">
                    <span>完成一次生成后，作品会保存在这里。</span>
                </StudioEmptyState>
            )}
        </div>
    );
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const logs: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            logs.push(value);
        });
        return (await Promise.all(logs.map(normalizeLog))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const video = log.video?.storageKey ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : log.video;
    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.videoModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: normalizeResolution(log.resolution || config.vquality || ""),
        seconds: log.seconds || config.videoSeconds || "",
        status: log.status || "success",
        task: log.task,
        video,
        error: log.error,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    return (
        <div className="absolute bottom-1 left-1 hidden items-center gap-1 group-hover:flex">
            {index > 0 && <HeroButton isIconOnly variant="secondary" size="sm" onPress={() => onMove(-1)} aria-label="向前移动图片"><ArrowLeft className="size-3.5" /></HeroButton>}
            {index < total - 1 && <HeroButton isIconOnly variant="secondary" size="sm" onPress={() => onMove(1)} aria-label="向后移动图片"><ArrowRight className="size-3.5" /></HeroButton>}
        </div>
    );
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoGenerateAudio: log.config?.videoGenerateAudio || "true",
        videoWatermark: log.config?.videoWatermark || "false",
        videoMode: log.config?.videoMode === "reference" ? "reference" : "frames",
    };
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    status,
    task,
    video,
    error,
}: {
    prompt: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
    durationMs: number;
    status: GenerationLog["status"];
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
}): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    return {
        ...config,
        model,
        videoModel: model,
        size: normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    return clampVideoSeconds(value);
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
