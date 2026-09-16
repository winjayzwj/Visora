// Adapted from React Bits CountUp. See LICENSE.md in this directory.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const DURATION = 420;

export function CountUp({ value, className = "" }: { value: number; className?: string }) {
    const reducedMotion = useReducedMotion();
    const fromRef = useRef(0);
    const frameRef = useRef(0);
    const [display, setDisplay] = useState(reducedMotion ? value : 0);

    useEffect(() => {
        if (reducedMotion) {
            fromRef.current = value;
            setDisplay(value);
            return;
        }

        const from = fromRef.current;
        if (from === value) {
            return;
        }

        const start = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - start) / DURATION);
            const eased = 1 - (1 - progress) ** 3;
            setDisplay(Math.round(from + (value - from) * eased));

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(step);
                return;
            }

            fromRef.current = value;
        };

        frameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frameRef.current);
    }, [reducedMotion, value]);

    return <span className={className}>{display}</span>;
}
