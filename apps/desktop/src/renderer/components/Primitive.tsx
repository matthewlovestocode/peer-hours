import type { PropsWithChildren, ReactNode } from "react";

/** Provides the shared surface container used to group related desktop UI content. */
export function Panel({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel ${className}`}>{children}</section>;
}

/** Displays a small semantic status indicator without exposing color as the only signal. */
export function StatusDot({ tone }: { tone: "good" | "warn" | "bad" | "neutral" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}

/** Displays a labeled value with optional supporting detail in a consistent metric layout. */
export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <div className="metric"><span className="metric__label">{label}</span><strong>{value}</strong>{detail && <span className="metric__detail">{detail}</span>}</div>;
}
