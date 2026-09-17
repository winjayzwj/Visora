import { useGSAP } from "@gsap/react";
import { Button, Surface } from "@heroui/react";
import { ArrowUpRight, Clapperboard, ImagePlus, Layers3, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { gsap } from "gsap";

import GradientText from "@/components/react-bits/GradientText";
import { HyperspeedBackdrop } from "@/components/react-bits/hyperspeed-backdrop";
import { RotatingText } from "@/components/ui/rotating-text";

gsap.registerPlugin(useGSAP);

const creativeRoutes = [
    { key: "image", href: "/image", icon: ImagePlus },
    { key: "video", href: "/video", icon: Clapperboard },
    { key: "canvas", href: "/canvas", icon: Layers3 },
] as const;

export default function IndexPage() {
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const reducedMotion = useReducedMotion();
    const pageRef = useRef<HTMLElement>(null);
    const rotatingIdeas = t("home.rotatingIdeas", { returnObjects: true }) as string[];
    const rotatingSplit = i18n.resolvedLanguage === "zh-CN" ? "characters" : "words";

    useGSAP(
        () => {
            const media = gsap.matchMedia();
            media.add("(prefers-reduced-motion: no-preference)", () => {
                gsap.fromTo("[data-home-reveal]", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.72, ease: "power3.out", stagger: 0.1, delay: 0.08 });
                gsap.to("[data-home-artwork]", { yPercent: -1.5, rotation: -0.35, duration: 5.8, ease: "sine.inOut", yoyo: true, repeat: -1 });
            });
            return () => media.revert();
        },
        { scope: pageRef },
    );

    return (
        <main ref={pageRef} className="studio-page creation-home relative z-0 isolate h-full min-h-0 overflow-y-auto text-foreground">
            <HyperspeedBackdrop className="creation-hyperspeed creation-hyperspeed--home" />
            <div className="studio-container creation-home-container relative z-10">
                <Surface className="creation-home-hero overflow-hidden !gap-0 !p-0">
                    <div className="creation-home-copy">
                        <p data-home-reveal className="creation-home-kicker">
                            {t("home.kicker")}
                        </p>
                        <h1 data-home-reveal className="creation-home-title" data-locale={i18n.resolvedLanguage}>
                            <GradientText className="block">
                                {t("home.rotatingPrefix")}
                                <span className="creation-home-rotating-line mt-3 block min-h-[1.18em] max-w-full leading-[1.08]">
                                    <RotatingText key={i18n.resolvedLanguage} texts={rotatingIdeas} auto={!reducedMotion} splitBy={rotatingSplit} staggerDuration={0} className="creation-home-rotating-text block w-full max-w-full leading-[1.08]" />
                                </span>
                            </GradientText>
                        </h1>
                        <p data-home-reveal className="creation-home-description">
                            <Trans
                                i18nKey="home.description"
                                components={{
                                    canvas: <span className="font-medium text-foreground" />,
                                    content: <span className="font-medium text-foreground" />,
                                }}
                            />
                        </p>
                        <div data-home-reveal className="creation-home-actions">
                            <Button variant="outline" size="lg" onPress={() => navigate("/image")}>
                                <Sparkles className="size-4" aria-hidden="true" />
                                {t("home.create")}
                            </Button>
                            <Button variant="tertiary" size="lg" onPress={() => navigate("/canvas")}>
                                {t("home.openCanvas")}
                                <ArrowUpRight className="size-4" aria-hidden="true" />
                            </Button>
                        </div>
                        <ol data-home-reveal className="creation-home-route" aria-label={t("home.routeLabel")}>
                            {creativeRoutes.map(({ key, href, icon: Icon }, index) => (
                                <li key={key}>
                                    <Button variant="ghost" className="group creation-home-route-action" onPress={() => navigate(href)}>
                                        <span className="creation-home-route-index">0{index + 1}</span>
                                        <Icon className="size-4" aria-hidden="true" />
                                        <span>{t(`home.routes.${key}.label`)}</span>
                                        <ArrowUpRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                                    </Button>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <figure data-home-reveal className="creation-home-artwork">
                        <div className="creation-home-artwork-frame">
                            <img data-home-artwork src="/brand/creative/studio-beam.webp" width="1122" height="1402" alt={t("home.artworkAlt")} />
                        </div>
                        <figcaption>
                            <span>{t("home.artworkEyebrow")}</span>
                            <p>{t("home.artworkCaption")}</p>
                        </figcaption>
                    </figure>
                </Surface>

                <section className="creation-home-sequence" aria-labelledby="home-sequence-title">
                    <header data-home-reveal className="creation-home-section-heading">
                        <p className="creation-home-kicker">{t("home.sequence.kicker")}</p>
                        <h2 id="home-sequence-title">{t("home.sequence.title")}</h2>
                        <p>{t("home.sequence.description")}</p>
                    </header>

                    <div className="creation-home-story">
                        <figure data-home-reveal className="creation-home-story-image">
                            <img src="/brand/creative/ribbon-story.webp" width="1536" height="1024" alt={t("home.storyArtworkAlt")} loading="lazy" />
                            <figcaption>{t("home.storyArtworkCaption")}</figcaption>
                        </figure>

                        <ol className="creation-home-sequence-list">
                            {creativeRoutes.map(({ key, href, icon: Icon }, index) => (
                                <li data-home-reveal key={key} className="creation-home-sequence-item">
                                    <span className="creation-home-sequence-number">0{index + 1}</span>
                                    <div className="creation-home-sequence-copy">
                                        <div className="flex items-start justify-between gap-4">
                                            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                                            <Button variant="tertiary" isIconOnly size="sm" aria-label={t(`home.routes.${key}.action`)} onPress={() => navigate(href)}>
                                                <ArrowUpRight className="size-4" aria-hidden="true" />
                                            </Button>
                                        </div>
                                        <h3>{t(`home.routes.${key}.title`)}</h3>
                                        <p>{t(`home.routes.${key}.description`)}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>
            </div>
        </main>
    );
}
