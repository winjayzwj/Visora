import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

// 状态签覆盖账号、团队、会员申请与会员四类状态，取值与 CSS 里的
// [data-status] 规则一一对应；新增状态时两边要同时加。
export type SealStatus =
    | "active"
    | "disabled"
    | "dissolved"
    | "pending"
    | "approved"
    | "rejected"
    | "expired";

export function SealBadge({ status, children }: { status: SealStatus; children: ReactNode }) {
    const reducedMotion = useReducedMotion();

    return (
        <motion.span
            key={status}
            className="seal-badge"
            data-status={status}
            initial={reducedMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 22, mass: 0.6 }}
        >
            {children}
        </motion.span>
    );
}
