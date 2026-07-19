/** Provides the consistent member-workspace title, context label, and supporting guidance. */
export function WorkspaceHeader({ eyebrow, title, description, headingId, variant = "default" }: {
  eyebrow: string;
  title: string;
  description: string;
  headingId?: string;
  variant?: "default" | "hero";
}) {
  return (
    <header className={`workspace-page-header workspace-page-header--${variant}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 id={headingId}>{title}</h1>
      <p className="muted">{description}</p>
    </header>
  );
}
