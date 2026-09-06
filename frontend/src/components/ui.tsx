import Link from "next/link";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger" }) {
  const styles = {
    primary: "bg-primary text-white hover:bg-blue-700",
    secondary: "border border-border bg-white text-ink hover:bg-slate-50",
    quiet: "text-primary hover:bg-pale",
    danger: "bg-danger text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={`font-semibold text-primary underline-offset-4 hover:underline ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  error,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <label className={`block ${className}`} htmlFor={id}>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : props["aria-describedby"]}
        className={`min-h-12 w-full rounded-lg border bg-white px-3 text-base text-ink shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-blue-100 ${error ? "border-danger" : "border-border"}`}
      />
      {error ? <span id={`${id}-error`} className="mt-1 block text-sm text-danger">{error}</span> : null}
      {!error && hint ? <span className="mt-1 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextArea({
  label,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <textarea
        {...props}
        id={id}
        className={`min-h-28 w-full resize-y rounded-lg border bg-white px-3 py-3 text-base text-ink shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-blue-100 ${error ? "border-danger" : "border-border"}`}
      />
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : null}
    </label>
  );
}

export function Card({ children, className = "", ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return <section {...props} className={`rounded-2xl border border-border bg-white p-5 shadow-card ${className}`}>{children}</section>;
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const normalized = status.toLowerCase();
  const styles = normalized.includes("present") || normalized.includes("healthy") || normalized.includes("approved")
    ? "bg-emerald-50 text-success"
    : normalized.includes("pending") || normalized.includes("open") || normalized.includes("degraded")
      ? "bg-amber-50 text-amber-700"
      : normalized.includes("cancel") || normalized.includes("closed") || normalized.includes("absent") || normalized.includes("failed") || normalized.includes("reject")
        ? "bg-red-50 text-danger"
        : "bg-slate-100 text-muted";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${styles}`}><span aria-hidden="true">●</span>{label ?? status.replaceAll("_", " ")}</span>;
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" | "success" | "warning" }) {
  const styles = {
    info: "border-blue-100 bg-pale text-ink",
    error: "border-red-100 bg-red-50 text-danger",
    success: "border-emerald-100 bg-emerald-50 text-emerald-900",
    warning: "border-amber-100 bg-amber-50 text-amber-900",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return <div role="status" className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted">{label}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center"><h2 className="text-base font-bold text-ink">{title}</h2><p className="mt-2 text-sm text-muted">{description}</p></div>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow ? <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p> : null}<h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}</div>{action}</div>;
}

export function SupportLink() {
  return <p className="text-sm text-muted">Need help? <TextLink href="mailto:attendance@korasalesacademy.example">Contact the Administrator</TextLink>.</p>;
}
