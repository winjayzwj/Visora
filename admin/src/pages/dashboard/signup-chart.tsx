import { motion, useReducedMotion } from "motion/react";
import type { DailyCount } from "../../services/api/platform";

// 近 7 日注册量。用内联 SVG 之外的纯 CSS 柱状图：数据只有 7 个点，
// 引一个图表库不划算，motion 只负责让柱子长出来。
export function SignupChart({ data }: { data: DailyCount[] }) {
    const reducedMotion = useReducedMotion();
    const max = Math.max(1, ...data.map((day) => day.count));

    if (data.length === 0) {
        return <p className="hint">暂无注册数据。</p>;
    }

    return (
        <div className="signup-chart" role="img" aria-label="近 7 日注册量">
            {data.map((day, index) => (
                <div className="signup-chart-col" key={day.date}>
                    <span className="signup-chart-value">{day.count}</span>
                    <div className="signup-chart-track">
                        <motion.span
                            className="signup-chart-bar"
                            data-empty={day.count === 0}
                            initial={reducedMotion ? false : { height: 0 }}
                            animate={{ height: `${Math.max((day.count / max) * 100, 2)}%` }}
                            transition={
                                reducedMotion
                                    ? { duration: 0 }
                                    : { type: "spring", stiffness: 190, damping: 24, delay: index * 0.045 }
                            }
                        />
                    </div>
                    <span className="signup-chart-label">{day.date.slice(5)}</span>
                </div>
            ))}
        </div>
    );
}
