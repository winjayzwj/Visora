import type { ReactNode } from "react";

export function PageHeading({ action, copy, title }: { action?: ReactNode; copy?: string; title: string }) {
    return (
        <header className="page-heading">
            <div>
                <h1>{title}</h1>
                {copy ? <p className="page-copy">{copy}</p> : null}
            </div>
            {action}
        </header>
    );
}
