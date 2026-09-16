import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Surface } from "@heroui/react";

import SpecularButton from "@/components/SpecularButton";
import { CreationSystemVisual } from "@/components/studio/creation-system-visual";

export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const reducedMotion = useReducedMotion();

    return (
        <main className="studio-page creation-home relative isolate flex h-full min-h-[620px] items-center overflow-hidden bg-background px-4 py-8 text-foreground sm:px-8 lg:px-12">
            <motion.div
                initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0, duration: reducedMotion ? 0 : 0.5 }}
                className="relative z-10 mx-auto w-full max-w-[1160px]"
            >
                <Surface className="creation-shell grid w-full overflow-hidden lg:min-h-[580px] lg:grid-cols-[minmax(0,1fr)_minmax(420px,.95fr)]">
                <div className="creation-copy flex flex-col justify-center px-7 py-12 sm:px-12 lg:px-14">
                    <h1 className="max-w-xl text-balance text-5xl leading-[0.95] font-semibold tracking-[-0.05em] sm:text-7xl">{t("meta.title")}</h1>
                    <p className="mt-7 max-w-xl text-balance text-base leading-7 text-muted sm:text-lg sm:leading-8">
                        <Trans
                            i18nKey="home.description"
                            components={{
                                canvas: <span className="font-medium text-foreground underline decoration-accent decoration-2 underline-offset-4" />,
                                content: <span className="rounded-sm bg-accent-soft px-1 text-accent-soft-foreground" />,
                            }}
                        />
                    </p>
                    <div className="mt-9 flex flex-wrap gap-3">
                        <SpecularButton size="md" speed={0.65} onClick={() => navigate("/image")}>
                            {t("home.generateImage")}
                            <ArrowRight className="size-4" />
                        </SpecularButton>
                        <SpecularButton size="md" speed={0.65} onClick={() => navigate("/video")}>
                            {t("home.generateVideo")}
                            <ArrowRight className="size-4" />
                        </SpecularButton>
                        <SpecularButton size="md" speed={0.65} onClick={() => navigate("/canvas")}>
                            {t("home.openCanvas")}
                        </SpecularButton>
                    </div>
                </div>
                <div className="creation-code-stage flex items-center justify-center p-7 sm:p-10 lg:p-12">
                    <CreationSystemVisual />
                </div>
                </Surface>
            </motion.div>
        </main>
    );
}
