/**
 * Fix for Windows Chromium rc-trigger popups landing off-screen (top:-12430px).
 *
 * Root cause: rc-align resets popup position via style.top='0' before measuring.
 * In some Chromium builds, after a previous open, the browser has serialized
 * left/top/right/bottom into the `inset` shorthand inline style. When rc-align
 * later sets style.top='0', the longhand no longer overrides the persisted `inset`
 * shorthand, so measurement reads the popup at its old off-screen position and
 * rc-align writes back -10x viewport coordinates.
 *
 * Fix: watch popup elements and clear their inline position styles when they
 * become hidden (display:none / visibility:hidden / rc-trigger closed state).
 * The next open starts with a clean inline style, so rc-align's top:0 reset works
 * and the popup measures and positions correctly.
 *
 * Covers Popover, Dropdown, Select, Tooltip, DatePicker, Cascader, Mentions.
 */

const POPUP_SELECTOR =
  '.ant-popover, .ant-dropdown, .ant-dropdown-wrap, .ant-select-dropdown, .ant-tooltip, .ant-picker-dropdown, .ant-cascader-menus, .ant-mentions-dropdown';

function isHidden(el: HTMLElement): boolean {
  const cs = getComputedStyle(el);
  return cs.display === 'none' || cs.visibility === 'hidden' || el.hasAttribute('aria-hidden');
}

function clearInlinePosition(el: HTMLElement) {
  // Clear position-related inline styles so next alignment starts clean.
  el.style.top = '';
  el.style.left = '';
  el.style.right = '';
  el.style.bottom = '';
  el.style.inset = '';
  el.style.margin = '';
}

export function installRcTriggerInsetFix() {
  if (typeof window === 'undefined') return;
  if ((window as any).__rcTriggerInsetInstalled) return;
  (window as any).__rcTriggerInsetInstalled = true;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target as HTMLElement;
      if (!el || !el.matches || !el.matches(POPUP_SELECTOR)) continue;
      if (isHidden(el)) {
        clearInlinePosition(el);
      }
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'class', 'aria-hidden'],
    subtree: true,
  });

  // Clean up any popups already in a hidden state.
  document.querySelectorAll(POPUP_SELECTOR).forEach((el) => {
    const h = el as HTMLElement;
    if (isHidden(h)) clearInlinePosition(h);
  });
}
