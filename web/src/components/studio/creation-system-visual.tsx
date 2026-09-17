import { Card } from "@heroui/react";

type CreationSystemVisualProps = { compact?: boolean };

export function CreationSystemVisual({ compact = false }: CreationSystemVisualProps) {
    return (
        <Card variant="default" className={`creation-system-visual !gap-0 !p-0 ${compact ? "creation-system-visual-compact" : ""}`} aria-hidden="true">
            <Card.Content className="!gap-0 !p-0">
                <div className="creation-system-head">
                    <span className="creation-system-dots">
                        <i />
                        <i />
                        <i />
                    </span>
                    <span className="creation-system-file">
                        <i />
                        scene.ts
                    </span>
                    <span className="creation-system-state">
                        <i /> READY
                    </span>
                </div>
                <div className="creation-system-code" role="presentation">
                    <p>
                        <b>1</b>
                        <span className="creation-system-keyword">const</span> scene = <span className="creation-system-function">canvas.compose</span>({"{"}
                    </p>
                    <p>
                        <b>2</b>&nbsp;&nbsp;<span className="creation-system-property">brief</span>: <span className="creation-system-string">"make the idea visible"</span>,
                    </p>
                    <p>
                        <b>3</b>&nbsp;&nbsp;<span className="creation-system-property">inputs</span>: [<span className="creation-system-string">"prompt"</span>, <span className="creation-system-string">"reference"</span>],
                    </p>
                    <p>
                        <b>4</b>&nbsp;&nbsp;<span className="creation-system-property">model</span>: <span className="creation-system-string">"selected"</span>,
                    </p>
                    <p>
                        <b>5</b>&nbsp;&nbsp;<span className="creation-system-property">output</span>: [<span className="creation-system-string">"image"</span>, <span className="creation-system-string">"motion"</span>],
                    </p>
                    <p>
                        <b>6</b>
                        {"}"});
                    </p>
                    <p>
                        <b>7</b>
                        <span className="creation-system-keyword">await</span> scene.<span className="creation-system-function">render</span>();
                    </p>
                </div>
                <div className="creation-system-flow">
                    <span>
                        <b>01</b> IDEA
                    </span>
                    <i />
                    <span>
                        <b>02</b> FRAME
                    </span>
                    <i />
                    <span>
                        <b>03</b> SEQUENCE
                    </span>
                </div>
            </Card.Content>
        </Card>
    );
}
