import type { ReactNode } from "react";
import { BlurText } from "./react-bits/blur-text";

export function PageHeading({ action, copy, title }: { action?: ReactNode; copy?: string; title: string }) {
    return (
        <section className="page-heading">
            <div>
                <h1>
                    <BlurText text={title} />
                </h1>
                {copy ? <p className="page-copy">{copy}</p> : null}
            </div>
            {action}
        </section>
    );
}
