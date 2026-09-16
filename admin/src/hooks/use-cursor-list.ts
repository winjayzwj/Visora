import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/error-message";
import { createRequestGate } from "../lib/request-gate";
import { ApiError, isAbortError, type Page } from "../services/api/platform";

type Options<T> = {
    // load 必须是稳定引用（用 useCallback 包），否则下面的加载 effect 会反复触发。
    // 筛选条件放进 load 的依赖里即可：条件变了 load 换引用，列表自动回到第一页。
    load: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>;
    onForbidden: () => void;
    onUnauthorized: () => void;
    // 换登录态时传 sessionToken，旧会话的数据必须丢掉，不能留在页面上。
    resetKey?: unknown;
};

// useCursorList 管住游标分页的固定套路：请求闸门、中止、页码栈、401/403 分流。
// 服务端所有列表接口都是 { items, nextCursor } 形状，逐页写一遍只会抄出五份同样的 bug。
export function useCursorList<T>({ load, onForbidden, onUnauthorized, resetKey }: Options<T>) {
    const gate = useRef(createRequestGate());
    const controller = useRef<AbortController>();

    const [items, setItems] = useState<T[]>([]);
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>();

    const cursor = cursors[cursors.length - 1] ?? null;

    const run = useCallback(
        async (target: string | null) => {
            controller.current?.abort();
            const next = new AbortController();
            const ticket = gate.current.issue();
            controller.current = next;
            setLoading(true);
            setError(undefined);

            try {
                const page = await load(target, next.signal);

                if (!gate.current.isCurrent(ticket)) {
                    return;
                }

                setItems(page.items);
                setNextCursor(page.nextCursor);
            } catch (thrown) {
                if (isAbortError(thrown) || !gate.current.isCurrent(ticket)) {
                    return;
                }
                if (thrown instanceof ApiError && thrown.status === 401) {
                    onUnauthorized();
                    return;
                }
                if (thrown instanceof ApiError && thrown.status === 403) {
                    onForbidden();
                    return;
                }

                setError(errorMessage(thrown));
            } finally {
                if (gate.current.isCurrent(ticket)) {
                    setLoading(false);
                }
            }
        },
        [load, onForbidden, onUnauthorized],
    );

    useEffect(() => {
        gate.current.invalidate();
        controller.current?.abort();
        setCursors([null]);
        setItems([]);
        setNextCursor(null);
        setError(undefined);
        void run(null);
    }, [resetKey, run]);

    useEffect(
        () => () => {
            gate.current.invalidate();
            controller.current?.abort();
        },
        [],
    );

    const goNext = useCallback(() => {
        if (!nextCursor) {
            return;
        }

        setCursors((stack) => [...stack, nextCursor]);
        void run(nextCursor);
    }, [nextCursor, run]);

    // 出栈与取数都放在 updater 外面：把副作用写进 setState 回调，
    // StrictMode 下会被执行两次，等于多发一次请求。
    const goPrevious = useCallback(() => {
        if (cursors.length < 2) {
            return;
        }

        const trimmed = cursors.slice(0, -1);
        setCursors(trimmed);
        void run(trimmed[trimmed.length - 1] ?? null);
    }, [cursors, run]);

    // reload 重取当前页，用于写操作后刷新；不要用它重置筛选，筛选交给 load 依赖。
    const reload = useCallback(() => void run(cursor), [cursor, run]);

    return {
        cursor,
        error,
        goNext,
        goPrevious,
        items,
        loading,
        nextCursor,
        page: cursors.length,
        reload,
        setError,
        setItems,
    };
}

export type CursorList<T> = ReturnType<typeof useCursorList<T>>;
