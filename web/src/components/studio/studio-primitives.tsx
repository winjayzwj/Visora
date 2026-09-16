import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Breadcrumbs } from "@heroui/react";

export function StudioPageHeader({ title, icon: Icon, actions, meta }: { title: string; icon: LucideIcon; actions?: ReactNode; meta?: ReactNode }) {
    return (
        <header className="studio-page-header">
            <h1 className="sr-only">{title}</h1>
            <Breadcrumbs className="studio-page-breadcrumbs" aria-label={`${title}位置`}>
                <Breadcrumbs.Item href="/">创作台</Breadcrumbs.Item>
                <Breadcrumbs.Item>
                    <span className="flex items-center gap-2"><Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />{title}</span>
                </Breadcrumbs.Item>
            </Breadcrumbs>
            {(meta || actions) && (
                <div className="studio-page-header-context">
                    {meta && <div className="studio-page-header-meta">{meta}</div>}
                    {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
                </div>
            )}
        </header>
    );
}

export function StudioEmptyState({ title, icon: Icon, children, className = "" }: { title: string; icon: LucideIcon; children?: ReactNode; className?: string }) {
    return (
        <section className={`studio-empty ${className}`}>
            <span className="studio-empty-icon" aria-hidden="true">
                <Icon size={28} strokeWidth={1.5} />
            </span>
            <h2 className="m-0 text-lg font-medium text-[var(--studio-text)]">{title}</h2>
            {children && <div className="mt-2 flex max-w-sm flex-col items-center gap-4 text-sm leading-6 text-[var(--studio-muted)]">{children}</div>}
        </section>
    );
}
