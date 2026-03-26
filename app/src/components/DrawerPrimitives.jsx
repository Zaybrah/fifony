// Shared drawer primitives — used by IssueDetailDrawer and ServiceDrawer.
// Any new drawer/panel should build on these.

// ── DrawerBackdrop ────────────────────────────────────────────────────────────

/**
 * Overlay that darkens the background behind a drawer panel.
 * Pass hideOnDesktop for split-panel drawers that don't block the main view on
 * large screens (e.g. ServiceDrawer). Leave it false for modal-style drawers
 * (e.g. IssueDetailDrawer) that always block content.
 */
export function DrawerBackdrop({ onClick, hideOnDesktop = false, className = "" }) {
  return (
    <div
      className={`fixed inset-0 bg-black/30 z-40 ${hideOnDesktop ? "lg:hidden" : ""} ${className}`}
      onClick={onClick}
    />
  );
}

// ── DrawerPanel ───────────────────────────────────────────────────────────────

/**
 * The sliding panel container. Handles CSS keyframe animations (slide-in-right
 * on mount, slide-out-right while closing). Uses the keyframes defined in
 * styles.css — do not replace with RAF+transition.
 *
 * @param {boolean} closing - triggers slide-out-right animation before onClose fires
 * @param {string}  width   - Tailwind width classes, e.g. "w-full md:w-[40vw] md:min-w-[520px]"
 */
export function DrawerPanel({ children, closing = false, width = "w-full md:w-[40vw] md:min-w-[520px] lg:min-w-[600px]", className = "", ...props }) {
  return (
    <div
      className={`fixed top-0 right-0 z-50 h-full ${width} bg-base-100 shadow-2xl flex flex-col border-l border-base-300 ${closing ? "animate-slide-out-right" : "animate-slide-in-right"} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ── DrawerSection ─────────────────────────────────────────────────────────────

/**
 * A standard bordered horizontal section inside a drawer.
 * Provides consistent padding and bottom border.
 */
export function DrawerSection({ children, className = "" }) {
  return (
    <div className={`px-6 py-3 border-b border-base-300 shrink-0 ${className}`}>
      {children}
    </div>
  );
}

// ── DrawerFieldLabel ──────────────────────────────────────────────────────────

/**
 * Micro-label above a field value (10px, uppercase, tracked, muted).
 * Use for Command / Dir / Port / Log / etc.
 */
export function DrawerFieldLabel({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-widest opacity-35 font-medium mb-1">
      {children}
    </div>
  );
}

// ── DrawerCloseButton ─────────────────────────────────────────────────────────

/**
 * Standard circular close (X) button for the drawer header.
 */
export function DrawerCloseButton({ onClick, label = "Close" }) {
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost btn-circle shrink-0 opacity-40 hover:opacity-80"
      onClick={onClick}
      aria-label={label}
    >
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
