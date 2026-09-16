// Adapted from React Bits BlurText. See LICENSE.md in this directory.
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

function split(text: string) {
    if (!CJK.test(text)) {
        return text.split(" ").map((word, index) => (index > 0 ? `\u00a0${word}` : word));
    }

    return Array.from(text);
}

export function BlurText({ text, className = "" }: { text: string; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true });
    const reducedMotion = useReducedMotion();
    const parts = split(text);

    return (
        <span ref={ref} className={className}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                {parts.map((part, index) => (
                    <motion.span
                        key={`${text}-${index}`}
                        className="inline-block"
                        initial={false}
                        animate={
                            inView || reducedMotion
                                ? { opacity: 1, filter: "blur(0px)", y: 0 }
                                : { opacity: 0.6, filter: "blur(2px)", y: 5 }
                        }
                        transition={{
                            duration: reducedMotion ? 0 : 0.42,
                            delay: reducedMotion ? 0 : index * 0.035,
                            ease: [0.22, 1, 0.36, 1],
                        }}
                    >
                        {part}
                    </motion.span>
                ))}
            </span>
        </span>
    );
}
