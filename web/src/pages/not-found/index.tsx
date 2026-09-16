import { Home } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
    const { t } = useTranslation();
    return (
        <div className="studio-shell flex h-dvh flex-col overflow-hidden">
            <main className="studio-page flex h-full min-h-0 items-center justify-center overflow-y-auto px-6 py-10">
                <section className="w-full max-w-md text-center">
                    <div className="mb-6 flex items-center justify-center text-7xl font-semibold text-[var(--studio-accent)]">
                        <span className="relative">404</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-normal">{t("notFound.title")}</h1>
                    <p className="mt-3 text-sm leading-6 text-[var(--studio-muted)]">{t("notFound.description")}</p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link to="/" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--studio-accent)] px-5 text-sm font-medium text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]">
                            <Home className="size-4" />
                            {t("notFound.home")}
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
