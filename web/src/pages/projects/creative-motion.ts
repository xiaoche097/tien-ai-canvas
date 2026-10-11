import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (notify: () => void) => {
    const media = matchMedia(query);
    media.addEventListener("change", notify);
    return () => media.removeEventListener("change", notify);
};
const snapshot = () => matchMedia(query).matches;

export const useCreativeReducedMotion = () => useSyncExternalStore(subscribe, snapshot, () => true);
