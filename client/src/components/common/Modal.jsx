import { useEffect, useRef } from "react";

/**
 * Shared modal shell.
 *
 * Extracted from the "Request Access" dialog so Admin review screens reuse the
 * exact same overlay, escape handling and scroll lock instead of repeating the
 * markup. The visual language is unchanged.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeDisabled = false,
  initialFocusRef,
}) {
  const panelRef = useRef(null);

  // Escape to dismiss, and stop the page scrolling behind the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !closeDisabled) onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeDisabled, onClose]);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      (initialFocusRef?.current || panelRef.current)?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [open, initialFocusRef]);

  if (!open) return null;

  const maxWidth = size === "lg" ? "max-w-[640px]" : size === "sm" ? "max-w-[440px]" : "max-w-[560px]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-deept/45 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain ${maxWidth} rounded-[28px] border border-deept/20 bg-white p-6 shadow-[0_24px_60px_-20px_rgba(31,74,64,0.45)] fade-up outline-none sm:p-7`}
      >
        {title ? (
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold" style={{ color: "#1a1a1a" }}>
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm font-medium text-ink-soft">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close dialog"
              className="rounded-full p-1.5 text-ink-soft transition hover:bg-lavender-pale disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}

        {children}

        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export default Modal;
