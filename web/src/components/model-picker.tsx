import { useMemo } from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ListBox, Select } from "@heroui/react";

import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig }: ModelPickerProps) {
    const { t } = useTranslation();
    const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");

    return (
        <Select
            value={current || null}
            placeholder={pickerPlaceholder}
            onChange={(nextValue) => {
                if (nextValue) onChange(String(nextValue));
            }}
            onOpenChange={(isOpen) => {
                if (isOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
            }}
            className={cn(fullWidth ? "w-full" : "w-fit max-w-full", className)}
        >
            <Select.Trigger
                className={cn(
                    "h-6 w-full max-w-full gap-1 rounded-lg border border-border bg-surface px-2 text-[11px] font-normal text-foreground shadow-xs transition-colors hover:bg-surface-secondary",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus/40",
                )}
                title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
            >
                <Select.Value className="min-w-0 flex-1 truncate text-left" />
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover data-canvas-no-zoom className="z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-surface p-1 text-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10">
                <ListBox>
                {options.length ? (
                    options.map((model) => (
                        <ListBox.Item key={model} id={model} textValue={modelOptionLabel(config, model)}>
                            <ModelLabel config={config} model={model} />
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))
                ) : (
                    <ListBox.Item id="__empty__" isDisabled>
                        {emptyModelLabel(config, capability)}
                    </ListBox.Item>
                )}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
