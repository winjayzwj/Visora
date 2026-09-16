import { Layers3 } from "lucide-react";

import { CreationSystemVisual } from "@/components/studio/creation-system-visual";

export function LoginBrandPanel() {
    return (
        <aside className="studio-login-brand relative hidden min-h-[620px] overflow-hidden bg-background text-foreground lg:flex" aria-label="Visora 创作工作流">
            <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-12">
                <div>
                    <div className="creation-login-signal" aria-hidden="true">
                        <span className="creation-login-signal-node">BRIEF</span>
                        <i />
                        <span className="creation-login-signal-node">FRAME</span>
                        <i />
                        <span className="creation-login-signal-node">MOTION</span>
                    </div>
                    <h2 className="max-w-md text-4xl leading-[1.02] font-semibold tracking-[-0.04em] xl:text-5xl">让每一步创作，都成为下一步的素材。</h2>
                    <p className="mt-5 max-w-sm text-sm leading-6 text-muted xl:text-base xl:leading-7">从灵感、图像到视频，在同一张无限画布上组织你的视觉工作流。</p>
                </div>
                <CreationSystemVisual compact />
                <div className="flex max-w-md items-start gap-3 border-t border-border pt-5 text-sm text-muted">
                    <Layers3 className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span>连接模型、素材与提示词，保留每一次生成之间的上下文。</span>
                </div>
            </div>
        </aside>
    );
}
