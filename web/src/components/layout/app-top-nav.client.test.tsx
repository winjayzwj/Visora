import { expect, test } from "bun:test";
import { Window } from "happy-dom";

// Run this client regression separately from SSR tests so React detects a DOM on import.
const browser = new Window({ url: "http://localhost/" });
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLAnchorElement", "HTMLButtonElement", "HTMLInputElement", "Element", "Node", "NodeFilter", "MutationObserver", "ResizeObserver", "Event", "MouseEvent", "PointerEvent", "KeyboardEvent", "SVGElement", "HTMLTextAreaElement", "HTMLSelectElement", "DocumentFragment", "ShadowRoot", "Document"] as const) {
    Object.defineProperty(globalThis, name, { configurable: true, value: name === "window" ? browser : browser[name] });
}
Object.assign(globalThis, {
    localStorage: browser.localStorage,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true,
    __APP_VERSION__: "test",
    __APP_RELEASES__: [],
});

const { act, Component } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MemoryRouter, useLocation } = await import("react-router-dom");
const { AppTopNav } = await import("./app-top-nav");
const { useThemeStore } = await import("@/stores/use-theme-store");

test("home navigation stays idle until a user acts, including after returning from a tool", async () => {
    const errors: string[] = [];
    const originalError = console.error;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.map(String).join(" ")); };
    console.error = (...args) => {
        const text = args.map(String).join(" ");
        errors.push(text);
        // Stop a broken effect loop rather than letting the test freeze indefinitely.
        if (text.includes("Maximum update depth")) throw new Error("Navigation update loop");
    };
    class Boundary extends Component<{ children: import("react").ReactNode }, { failed: boolean }> {
        state = { failed: false };
        static getDerivedStateFromError() { return { failed: true }; }
        render() { return this.state.failed ? <div>Navigation update loop</div> : this.props.children; }
    }
    function Location() { return <output>{useLocation().pathname}</output>; }
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const click = async (element: Element | null) => {
        expect(element).not.toBeNull();
        await act(async () => { (element as HTMLElement).click(); });
    };
    try {
        await act(async () => {
            root.render(<Boundary><MemoryRouter initialEntries={["/"]}><AppTopNav /><Location /></MemoryRouter></Boundary>);
        });
        expect(errors.filter((error) => error.includes("Maximum update depth"))).toEqual([]);
        expect(warnings.filter((warning) => warning.includes("PressResponder"))).toEqual([]);
        expect(container.querySelector("output")?.textContent).toBe("/");
        const nav = () => container.querySelector('[role="tablist"][aria-label="导航"], [role="tablist"][aria-label="Navigation"]')!;
        expect(nav().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
        await click(nav().querySelectorAll('[role="tab"]')[1]);
        expect(container.querySelector("output")?.textContent).toBe("/image");
        await click(container.querySelector('a[href="/"]'));
        expect(container.querySelector("output")?.textContent).toBe("/");
        expect(nav().querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
        await click(container.querySelector('[role="tab"][aria-label="light"]'));
        expect(useThemeStore.getState().preference).toBe("light");
        expect(container.querySelector("output")?.textContent).toBe("/");
        await click(container.querySelector('button[aria-label="打开导航菜单"], button[aria-label="Open navigation menu"]'));
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        await click(document.querySelector('[role="dialog"] button[slot="close"]'));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(container.querySelector("output")?.textContent).toBe("/");
        expect(errors).toEqual([]);
        expect(warnings).toEqual([]);
    } finally {
        await act(async () => root.unmount());
        container.remove();
        console.error = originalError;
        console.warn = originalWarn;
        await browser.happyDOM.abort();
    }
});
