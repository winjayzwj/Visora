import { Clapperboard, ImagePlus, Layers3 } from "lucide-react";
import { useTranslation } from "react-i18next";

import GradientText from "@/components/react-bits/GradientText";

const creativeDisciplines = [
    { key: "image", icon: ImagePlus },
    { key: "video", icon: Clapperboard },
    { key: "canvas", icon: Layers3 },
] as const;

export function LoginBrandPanel() {
    const { t } = useTranslation();

    return (
        <aside className="studio-login-brand relative hidden min-h-[600px] min-w-0 overflow-hidden text-foreground lg:flex" aria-label={t("login.brand.aria")}>
            <div className="relative z-10 flex w-full flex-col px-10 py-10 xl:px-12">
                <div className="flex items-center gap-3 text-sm font-semibold tracking-tight">
                    <span>{t("login.brand.wordmark")}</span>
                    <span className="h-3 w-px bg-border" aria-hidden="true" />
                    <span className="text-[11px] font-medium tracking-[0.16em] text-muted">VISORA AI</span>
                </div>

                <div className="mt-auto max-w-[27rem] pt-10">
                    <p className="creation-login-kicker">{t("login.brand.kicker")}</p>
                    <h2 className="mt-4 max-w-[11ch] text-balance text-[clamp(2.15rem,3vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.045em]">
                        <GradientText className="block" animationSpeed={10} direction="diagonal">
                            {t("login.brand.heading")}
                        </GradientText>
                    </h2>
                    <p className="mt-5 max-w-[24rem] text-sm leading-7 text-muted">{t("login.brand.description")}</p>
                </div>

                <figure className="creation-login-artwork mt-7">
                    <img src="/brand/creative/ribbon-story.webp" width="1536" height="1024" alt={t("login.brand.artworkAlt")} />
                    <figcaption>{t("login.brand.artworkCaption")}</figcaption>
                </figure>

                <ul className="creation-login-disciplines mt-7" aria-label={t("login.brand.disciplinesLabel")}>
                    {creativeDisciplines.map(({ key, icon: Icon }, index) => (
                        <li key={key}>
                            <span>0{index + 1}</span>
                            <Icon className="size-3.5" aria-hidden="true" />
                            <span>{t(`login.brand.disciplines.${key}`)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </aside>
    );
}
