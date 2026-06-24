/** Shared Tailwind class groups for mobile-friendly forms and dialogs (C125). */

export const MOBILE_FORM_GRID_TWO_COL =
  "grid grid-cols-1 gap-4 min-w-0 md:grid-cols-2";

export const MOBILE_FORM_GRID_THREE_COL =
  "grid grid-cols-1 gap-3 min-w-0 sm:grid-cols-2 lg:grid-cols-3";

export const MOBILE_DIALOG_ACTIONS =
  "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>button]:min-h-10 [&>button]:w-full sm:[&>button]:w-auto";

export const MOBILE_CONTAINED_SCROLL = "min-w-0 overflow-x-auto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns false when a label looks like a raw UUID (should not appear in UI copy). */
export function isSafeDisplayLabel(label: string): boolean {
  return !UUID_RE.test(label.trim());
}

/** Action groups use column layout below the `sm` breakpoint. */
export function mobileActionGroupStacksAtMobile(): boolean {
  return MOBILE_DIALOG_ACTIONS.includes("flex-col-reverse");
}
