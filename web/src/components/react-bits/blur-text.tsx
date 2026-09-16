// Adapted from React Bits BlurText; copyright and license in LICENSE.md.
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

export function BlurText({ text, className = "" }: { text: string; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true });
    const reducedMotion = useReducedMotion();

    return (
        <span ref={ref} className={className}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                {text.split(" ").map((word, index) => (
                    <motion.span
                        key={`${text}-${index}`}
                        className="inline-block"
                        initial={false}
                        animate={inView || reducedMotion ? { opacity: 1, filter: "blur(0px)", y: 0 } : { opacity: 0.65, filter: "blur(2px)", y: 6 }}
                        transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {index > 0 ? "\u00a0" : ""}
                        {word}
                    </motion.span>
                ))}
            </span>
        </span>
    );
}
