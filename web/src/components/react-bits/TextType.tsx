import { useEffect, useState } from "react";

type TextTypeProps = {
    text: string;
    className?: string;
    typingSpeed?: number;
    showCursor?: boolean;
    loop?: boolean;
};

// React Bits TextType-style type reveal, kept deliberately small for a stable navigation wordmark.
export default function TextType({ text, className, typingSpeed = 58, showCursor = true, loop = false }: TextTypeProps) {
    const [value, setValue] = useState("");
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReducedMotion(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    useEffect(() => {
        if (reducedMotion) {
            setValue(text);
            return;
        }
        let index = 0;
        let timer = 0;
        setValue("");
        const type = () => {
            index += 1;
            setValue(text.slice(0, index));
            if (index < text.length) timer = window.setTimeout(type, typingSpeed);
            else if (loop) timer = window.setTimeout(() => {
                index = 0;
                setValue("");
                type();
            }, 2400);
        };
        timer = window.setTimeout(type, typingSpeed);
        return () => window.clearTimeout(timer);
    }, [loop, reducedMotion, text, typingSpeed]);

    return (
        <span className={className} aria-hidden="true">
            {value}
            {showCursor ? <span className="react-bits-text-type-cursor">|</span> : null}
        </span>
    );
}
