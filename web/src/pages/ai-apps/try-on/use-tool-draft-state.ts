import { useCallback, useRef, useState, type SetStateAction } from "react";

type ToolDraftSetter<T> = (next: SetStateAction<T>, targetToolId?: string) => void;

// 异步回调保留发起时的工具键，切换工具不会把旧响应写入新草稿。
export function useToolDraftState<T>(toolId: string, initialValue: T): [T, ToolDraftSetter<T>] {
    const initial = useRef(initialValue);
    const [drafts, setDrafts] = useState<Record<string, T>>({});
    const update = useCallback<ToolDraftSetter<T>>((next, targetToolId = toolId) => {
        setDrafts((current) => {
            const previous = Object.hasOwn(current, targetToolId) ? current[targetToolId] : initial.current;
            return { ...current, [targetToolId]: typeof next === "function" ? (next as (value: T) => T)(previous) : next };
        });
    }, [toolId]);
    return [Object.hasOwn(drafts, toolId) ? drafts[toolId] : initial.current, update];
}
