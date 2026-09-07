import { X } from "lucide-react";

function Modal({ open, onClose, title, children, footer, size = "md" }) {
  if (!open) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative z-10 w-full ${sizes[size] || sizes.md} max-h-[90vh] overflow-y-auto rounded-2xl border border-deept/10 bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-deept/10 px-5 py-4">
          <h3 className="font-heading text-lg font-bold text-teal-deep">{title}</h3>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg hover:bg-teal-pale transition-colors" aria-label="Close">
            <X className="size-4 text-ink-soft" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-deept/10 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export { Modal };
