// Adapted from React Bits TextType. See LICENSE.md in this directory.
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const STEP = 62;

export function TextType({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
    const reducedMotion = useReducedMotion();
    const [count, setCount] = useState(reducedMotion ? text.length : 0);
    const done = count >= text.length;

    useEffect(() => {
        if (reducedMotion) {
            setCount(text.length);
            return;
        }

        setCount(0);
        let typed = 0;
        let timer = 0;
        let interval = 0;

        timer = window.setTimeout(() => {
            interval = window.setInterval(() => {
                typed += 1;
                setCount(typed);
                if (typed >= text.length) {
                    window.clearInterval(interval);
                }
            }, STEP);
        }, delay);

        return () => {
            window.clearTimeout(timer);
            window.clearInterval(interval);
        };
    }, [delay, reducedMotion, text]);

    return (
        <span className={className}>
            <span className="sr-only">{text}</span>
            <span aria-hidden="true">
                {text.slice(0, count)}
                {done ? null : <span className="type-caret" />}
            </span>
        </span>
    );
}
