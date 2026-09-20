import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Info, Trash2, X } from "lucide-react";

export type AppConfirmTone = "danger" | "warning" | "info";

export type AppConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppConfirmTone;
};

type PendingConfirmation = Required<Omit<AppConfirmOptions, "tone">> & {
  tone: AppConfirmTone;
  resolve: (answer: boolean) => void;
};

type AppDialogContextValue = {
  confirm: (options: AppConfirmOptions) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: AppConfirmOptions) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const next = {
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || "ยืนยัน",
      cancelLabel: options.cancelLabel || "ยกเลิก",
      tone: options.tone || "warning",
      resolve
    } satisfies PendingConfirmation;
    pendingRef.current = next;
    setPending(next);
  }), []);

  const settle = useCallback((answer: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(answer);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [pending, settle]);

  const Icon = pending?.tone === "danger" ? Trash2 : pending?.tone === "info" ? Info : AlertTriangle;

  return <AppDialogContext.Provider value={{ confirm }}>
    {children}
    {pending && <div className="app-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) settle(false); }}>
      <section className={`app-confirm-dialog tone-${pending.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message">
        <header className="app-dialog-header">
          <span className="app-dialog-icon"><Icon aria-hidden /></span>
          <div><span>{pending.tone === "danger" ? "โปรดยืนยันการลบ" : pending.tone === "warning" ? "โปรดยืนยัน" : "ข้อมูล"}</span><h2 id="app-confirm-title">{pending.title}</h2></div>
          <button className="app-dialog-close" type="button" onClick={() => settle(false)} aria-label="ปิดหน้าต่าง"><X aria-hidden /></button>
        </header>
        <div className="app-dialog-body"><p id="app-confirm-message">{pending.message}</p></div>
        <footer className="app-dialog-actions">
          <button className="template-button" type="button" onClick={() => settle(false)}>{pending.cancelLabel}</button>
          <button ref={confirmButtonRef} className={pending.tone === "danger" ? "danger-button" : "primary-button"} type="button" onClick={() => settle(true)}>{pending.confirmLabel}</button>
        </footer>
      </section>
    </div>}
  </AppDialogContext.Provider>;
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error("useAppDialog must be used inside AppDialogProvider");
  return context;
}

export function useModalDismiss(active: boolean, onClose: () => void, disabled = false) {
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [active, disabled, onClose]);
}
