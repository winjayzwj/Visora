import { Check, Copy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/heroui-compat";

type CopyState = "idle" | "copied" | "failed";

const ICON = { idle: Copy, copied: Check, failed: X } as const;
const HINT = { idle: "复制", copied: "已复制", failed: "复制失败，请手动选择" } as const;

export function CopyButton({ value, label }: { value: string; label: string }) {
    const [state, setState] = useState<CopyState>("idle");
    const timer = useRef(0);
    const Icon = ICON[state];

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(value);
            setState("copied");
        } catch {
            setState("failed");
        }

        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState("idle"), 1600);
    }, [value]);

    return (
        <Button
            isIconOnly
            variant="tertiary"
            className="copy-button"
            data-state={state}
            aria-label={`${label}：${HINT[state]}`}
            title={HINT[state]}
            onClick={() => void copy()}
        >
            <Icon aria-hidden="true" size={13} />
        </Button>
    );
}
