// Adapted from React Bits RotatingText; copyright and license in ../react-bits/LICENSE.md.
import { AnimatePresence, motion, type Transition, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

type SplitBy = "characters" | "words";

type RotatingTextProps = {
    texts: string[];
    className?: string;
    splitBy?: SplitBy;
    rotationInterval?: number;
    staggerDuration?: number;
    auto?: boolean;
    transition?: Transition;
};

export function RotatingText({ texts, className, splitBy = "characters", rotationInterval = 2400, staggerDuration = 0.025, auto = true, transition = { type: "spring", damping: 25, stiffness: 300 } }: RotatingTextProps) {
    const reducedMotion = useReducedMotion();
    const [currentIndex, setCurrentIndex] = useState(0);
    const currentText = texts[currentIndex] || "";
    const elements = useMemo(() => (splitBy === "words" ? currentText.split(/(\s+)/).filter(Boolean) : Array.from(currentText)), [currentText, splitBy]);

    useEffect(() => {
        if (!auto || reducedMotion || texts.length < 2) return;
        const timer = window.setInterval(() => setCurrentIndex((index) => (index + 1) % texts.length), rotationInterval);
        return () => window.clearInterval(timer);
    }, [auto, reducedMotion, rotationInterval, texts.length]);

    return (
        <span className={cn("relative inline-flex max-w-full flex-wrap align-baseline", className)}>
            <span className="sr-only">{currentText}</span>
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={currentText} className="inline-flex max-w-full flex-wrap" aria-hidden="true">
                    {elements.map((element, index) => (
                        <motion.span
                            key={`${currentText}-${index}`}
                            className="inline-block whitespace-pre"
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reducedMotion ? undefined : { opacity: 0 }}
                            transition={{ ...transition, delay: reducedMotion ? 0 : index * staggerDuration }}
                        >
                            {element}
                        </motion.span>
                    ))}
                </motion.span>
            </AnimatePresence>
        </span>
    );
}
