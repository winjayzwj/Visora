import { CountUp } from "./react-bits/count-up";

export function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
    return (
        <article className="stat-card">
            <span className="stat-card-label">{label}</span>
            <CountUp className="stat-card-value" value={value} />
            {hint ? <span className="stat-card-hint">{hint}</span> : null}
        </article>
    );
}
