import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

const cyan = "#06b6d4";
const teal = "#00f5d4";
const mint = "#a7f3d0";
const slate = "#07090e";
const light = "#f1fcfa";
const muted = "#94a3b8";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const p = (frame: number, from: number, to: number, easing = easeOut) => interpolate(frame, [from, to], [0, 1], { ...clamp, easing });
const between = (frame: number, from: number, to: number) => Math.min(p(frame, from, to), 1 - p(frame, to, to + 24));

function Backdrop({ vertical = false }: { vertical?: boolean }) {
    const frame = useCurrentFrame();
    const offset = (frame / 240) * (vertical ? 54 : 72);
    return (
        <AbsoluteFill style={{ background: slate, overflow: "hidden", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
            <AbsoluteFill
                style={{
                    opacity: 0.54,
                    backgroundImage:
                        "linear-gradient(rgba(148,163,184,.075) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.075) 1px, transparent 1px)",
                    backgroundSize: vertical ? "54px 54px" : "72px 72px",
                    backgroundPosition: `${offset}px ${offset * 0.65}px`,
                }}
            />
            <AbsoluteFill style={{ background: "linear-gradient(132deg, rgba(6,182,212,.16), transparent 28%, transparent 72%, rgba(0,245,212,.10))" }} />
            <div style={{ position: "absolute", inset: 54, border: "1px solid rgba(148,163,184,.18)" }} />
            <div style={{ position: "absolute", top: 54, left: 54, width: 84, height: 2, background: cyan }} />
            <div style={{ position: "absolute", right: 54, bottom: 54, width: 84, height: 2, background: teal }} />
        </AbsoluteFill>
    );
}

function BrandMark({ size = 72 }: { size?: number }) {
    return <Img src={staticFile("logo.svg")} style={{ width: size, height: size, objectFit: "contain" }} />;
}

type Source = { label: string; detail: string; y: number; accent: string };

const sources: Source[] = [
    { label: "REFERENCE", detail: "IMAGE", y: 392, accent: "#38bdf8" },
    { label: "PROMPT", detail: "TEXT", y: 544, accent: "#22d3ee" },
    { label: "MODEL", detail: "VISION", y: 696, accent: "#5eead4" },
    { label: "AGENT", detail: "LOCAL", y: 848, accent: "#a7f3d0" },
];

function LoginSource({ source, index }: { source: Source; index: number }) {
    const frame = useCurrentFrame();
    const show = between(frame, 10 + index * 7, 205);
    const converge = p(frame, 86, 150, easeInOut);
    const x = interpolate(converge, [0, 1], [166, 540], clamp);
    const y = interpolate(converge, [0, 1], [source.y, 630], clamp);
    const size = interpolate(converge, [0, 0.72, 1], [116, 52, 0], clamp);
    const routeStart = 236;
    const routeEnd = 540;
    const draw = p(frame, 28 + index * 8, 76 + index * 8, easeOut) * (1 - p(frame, 164, 210));
    const packet = p(frame, 74 + index * 7, 156 + index * 7, easeInOut);
    const path = `M ${routeStart} ${source.y} C 370 ${source.y} 402 630 ${routeEnd} 630`;
    const packetX = interpolate(packet, [0, 1], [routeStart, routeEnd], clamp);
    const packetY = interpolate(packet, [0, 1], [source.y, 630], clamp);

    return (
        <>
            <svg width="1080" height="1350" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                <path d={path} fill="none" stroke={source.accent} strokeWidth="2" strokeDasharray="640" strokeDashoffset={640 * (1 - draw)} opacity={draw * 0.65} />
                <circle cx={packetX} cy={packetY} r="7" fill={source.accent} opacity={packet * (1 - p(frame, 148, 166))} />
            </svg>
            <div
                style={{
                    position: "absolute",
                    left: x - size / 2,
                    top: y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: 18,
                    border: `1px solid ${source.accent}`,
                    background: "rgba(12,16,23,.88)",
                    boxShadow: `0 14px 30px rgba(0,0,0,.25), 0 0 22px ${source.accent}33`,
                    opacity: show * (size > 1 ? 1 : 0),
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    overflow: "hidden",
                }}
            >
                <span style={{ color: light, fontSize: Math.max(8, size * 0.12), fontWeight: 700, letterSpacing: 1.6 }}>{source.label}</span>
                <span style={{ color: source.accent, fontSize: Math.max(7, size * 0.1), marginTop: 5, letterSpacing: 1.2 }}>{source.detail}</span>
            </div>
        </>
    );
}

function CanvasCard({ frame }: { frame: number }) {
    const card = between(frame, 138, 205);
    const line = p(frame, 154, 184);
    return (
        <div
            style={{
                position: "absolute",
                left: 176,
                top: 930,
                width: 728,
                height: 256,
                borderRadius: 24,
                padding: 30,
                opacity: card,
                transform: `translateY(${24 * (1 - card)}px)`,
                border: "1px solid rgba(6,182,212,.48)",
                background: "rgba(12,16,23,.82)",
                boxShadow: "0 22px 46px rgba(0,0,0,.28)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: teal, boxShadow: "0 0 14px #00f5d4" }} />
                <span style={{ color: light, fontWeight: 700, fontSize: 25, letterSpacing: 1.5 }}>CANVAS WORKFLOW</span>
                <span style={{ marginLeft: "auto", color: mint, fontSize: 18, letterSpacing: 1.2 }}>READY</span>
            </div>
            <div style={{ position: "relative", height: 128, marginTop: 30 }}>
                {[0, 1, 2].map((index) => (
                    <div
                        key={index}
                        style={{
                            position: "absolute",
                            left: 24 + index * 212,
                            top: 20,
                            width: 136,
                            height: 76,
                            borderRadius: 14,
                            border: "1px solid rgba(148,163,184,.36)",
                            background: "rgba(148,163,184,.08)",
                            opacity: p(frame, 158 + index * 7, 176 + index * 7),
                        }}
                    >
                        <div style={{ width: 44, height: 5, margin: "18px 16px 10px", borderRadius: 4, background: index === 1 ? cyan : "rgba(226,232,240,.48)" }} />
                        <div style={{ width: 82, height: 4, marginLeft: 16, borderRadius: 4, background: "rgba(148,163,184,.32)" }} />
                    </div>
                ))}
                {[0, 1].map((index) => <div key={index} style={{ position: "absolute", left: 160 + index * 212, top: 57, width: 52 * line, height: 2, background: teal }} />)}
            </div>
        </div>
    );
}

export function LoginBrandLoop() {
    const frame = useCurrentFrame();
    const brand = between(frame, 16, 218);
    const core = p(frame, 104, 146, easeOut) * (1 - p(frame, 192, 224));
    return (
        <AbsoluteFill>
            <Backdrop vertical />
            <div style={{ position: "absolute", left: 90, top: 102, display: "flex", alignItems: "center", gap: 20, opacity: brand }}>
                <BrandMark size={66} />
                <div>
                    <div style={{ color: light, fontSize: 31, fontWeight: 700, letterSpacing: 1.2 }}>映序 · Visora AI</div>
                    <div style={{ color: cyan, fontSize: 15, marginTop: 8, letterSpacing: 2.4 }}>CANVAS STUDIO</div>
                </div>
            </div>
            <div style={{ position: "absolute", left: 90, top: 230, color: muted, fontSize: 18, lineHeight: 1.6, letterSpacing: 1.2, opacity: brand }}>
                FROM IDEA TO VISUAL WORKFLOW
            </div>
            {sources.map((source, index) => <LoginSource key={source.label} source={source} index={index} />)}
            <div
                style={{
                    position: "absolute",
                    left: 462,
                    top: 552,
                    width: 156,
                    height: 156,
                    borderRadius: 78,
                    display: "grid",
                    placeItems: "center",
                    border: `2px solid ${cyan}`,
                    background: "rgba(7,9,14,.94)",
                    boxShadow: "0 0 0 18px rgba(6,182,212,.08), 0 0 46px rgba(6,182,212,.38)",
                    opacity: core,
                    transform: `scale(${0.8 + core * 0.2})`,
                }}
            >
                <BrandMark size={84} />
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 742, textAlign: "center", color: light, fontSize: 26, fontWeight: 600, letterSpacing: 1.4, opacity: p(frame, 142, 168) * (1 - p(frame, 192, 220)) }}>
                CONNECT · COMPOSE · CREATE
            </div>
            <CanvasCard frame={frame} />
        </AbsoluteFill>
    );
}

function BlueprintNode({ label, x, y, frame, index }: { label: string; x: number; y: number; frame: number; index: number }) {
    const reveal = p(frame, 56 + index * 10, 94 + index * 10, easeOut) * (1 - p(frame, 204, 232));
    return (
        <div
            style={{
                position: "absolute",
                left: x,
                top: y,
                width: 236,
                height: 138,
                borderRadius: 16,
                border: "1px solid rgba(6,182,212,.58)",
                background: "rgba(12,16,23,.88)",
                padding: 22,
                opacity: reveal,
                boxShadow: "0 12px 30px rgba(0,0,0,.22)",
            }}
        >
            <div style={{ display: "flex", gap: 9, alignItems: "center", color: cyan, fontSize: 13, letterSpacing: 1.5 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: teal }} />NODE {String(index + 1).padStart(2, "0")}</div>
            <div style={{ marginTop: 24, color: light, fontSize: 23, fontWeight: 650 }}>{label}</div>
            <div style={{ marginTop: 12, width: 128, height: 4, borderRadius: 4, background: "rgba(148,163,184,.42)" }} />
        </div>
    );
}

function HomeCanvas() {
    const frame = useCurrentFrame();
    const outline = p(frame, 18, 64) * (1 - p(frame, 212, 238));
    const sweep = interpolate(frame, [48, 150], [260, 1660], clamp);
    const panel = between(frame, 118, 208);
    return (
        <div style={{ position: "absolute", inset: 0 }}>
            <div style={{ position: "absolute", left: 220, top: 155, right: 220, bottom: 132, border: "1px solid rgba(148,163,184,.26)", borderRadius: 26, opacity: outline, background: "rgba(7,9,14,.50)" }} />
            <div style={{ position: "absolute", left: 260, top: 212, color: muted, fontSize: 16, letterSpacing: 2.8, opacity: outline }}>VISUAL WORKFLOW / BLUEPRINT</div>
            <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
                <path d="M 574 448 C 650 448 658 364 770 364" fill="none" stroke="rgba(6,182,212,.46)" strokeWidth="2" strokeDasharray="420" strokeDashoffset={420 * (1 - outline)} />
                <path d="M 574 680 C 660 680 666 576 770 576" fill="none" stroke="rgba(0,245,212,.46)" strokeWidth="2" strokeDasharray="420" strokeDashoffset={420 * (1 - outline)} />
                <path d="M 1006 364 C 1096 364 1114 474 1220 474" fill="none" stroke="rgba(6,182,212,.46)" strokeWidth="2" strokeDasharray="420" strokeDashoffset={420 * (1 - outline)} />
                <path d="M 1006 576 C 1096 576 1114 474 1220 474" fill="none" stroke="rgba(0,245,212,.46)" strokeWidth="2" strokeDasharray="420" strokeDashoffset={420 * (1 - outline)} />
                <line x1={sweep} y1="192" x2={sweep} y2="900" stroke={teal} strokeWidth="5" opacity={p(frame, 48, 62) * (1 - p(frame, 150, 170))} />
            </svg>
            <BlueprintNode label="Prompt" x={338} y={380} frame={frame} index={0} />
            <BlueprintNode label="Reference" x={338} y={612} frame={frame} index={1} />
            <BlueprintNode label="Canvas" x={770} y={296} frame={frame} index={2} />
            <BlueprintNode label="Agent" x={770} y={508} frame={frame} index={3} />
            <BlueprintNode label="Visual Output" x={1220} y={406} frame={frame} index={4} />
            <div style={{ position: "absolute", left: 276, right: 276, bottom: 170, display: "flex", gap: 24, opacity: panel }}>
                {[
                    ["01", "CONTEXT", "Bring references together"],
                    ["02", "CANVAS", "Compose the visual direction"],
                    ["03", "AGENT", "Keep the workflow moving"],
                ].map(([number, title, detail]) => (
                    <div key={number} style={{ flex: 1, borderRadius: 16, border: "1px solid rgba(148,163,184,.24)", background: "rgba(12,16,23,.68)", padding: "20px 22px" }}>
                        <span style={{ color: teal, fontSize: 13, letterSpacing: 1.8 }}>{number}</span>
                        <span style={{ marginLeft: 14, color: light, fontSize: 17, fontWeight: 700, letterSpacing: 1.1 }}>{title}</span>
                        <div style={{ marginTop: 12, color: muted, fontSize: 15 }}>{detail}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HomeBrandLoop() {
    const frame = useCurrentFrame();
    const title = between(frame, 14, 216);
    return (
        <AbsoluteFill>
            <Backdrop />
            <div style={{ position: "absolute", left: 96, top: 78, display: "flex", alignItems: "center", gap: 18, opacity: title }}>
                <BrandMark size={52} />
                <span style={{ color: light, fontSize: 25, fontWeight: 700, letterSpacing: 1.1 }}>映序 · Visora AI</span>
            </div>
            <div style={{ position: "absolute", left: 96, top: 158, color: cyan, fontSize: 16, letterSpacing: 3.4, opacity: title }}>CREATIVE WORKFLOW IN MOTION</div>
            <HomeCanvas />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 76, color: muted, textAlign: "center", fontSize: 15, letterSpacing: 2.2, opacity: title }}>FROM IDEA · TO CANVAS · TO VISUAL OUTPUT</div>
        </AbsoluteFill>
    );
}
