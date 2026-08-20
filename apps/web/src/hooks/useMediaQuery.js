import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 *
 * The layout used to be driven by `window.innerWidth` read into state plus a
 * 150ms-debounced `resize` listener, in two components that each kept their own
 * copy. That has three problems: every resize frame ran a handler even when no
 * breakpoint was crossed, the layout lagged the viewport by the debounce, and
 * the JS breakpoints silently drifted from the Tailwind ones in the markup.
 *
 * `matchMedia` fires only when the query actually flips, needs no debounce, and
 * uses the same breakpoint the stylesheet does. `useSyncExternalStore` is the
 * React primitive for exactly this: an external store read during render,
 * without an effect that sets state after paint.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // Server snapshot: assume the roomy layout so markup does not flip on hydrate.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Breakpoints. These are the Tailwind defaults, written once here so the JS and
 * the utility classes in the markup cannot disagree.
 *
 * COMPACT was 768px in JS while the markup it controls was already written
 * against `lg` (1024px) - `lg:hidden` on the tab bar, `lg:w-auto` on the panels.
 * Everything between the two got neither layout: no tab bar was rendered, and
 * the desktop split was squeezed onto a tablet, leaving a ~384px editor (about
 * 49 columns) on an iPad in portrait. Matching `lg` closes that gap.
 */
const COMPACT_QUERY = "(max-width: 1023.98px)";
const NARROW_QUERY = "(max-width: 479.98px)";

/** True when the viewport is too narrow for the side-by-side editor/terminal split. */
export function useIsCompactLayout() {
  return useMediaQuery(COMPACT_QUERY);
}

/** True on small phones, where the status bar drops its secondary detail. */
export function useIsNarrowViewport() {
  return useMediaQuery(NARROW_QUERY);
}

export default useMediaQuery;
