/** Identifies a planned workspace without presenting it as an available navigation destination. */
export function NavigationPlaceholder({ label }: { label: string }) {
  return <span className="navigation-placeholder">{label}</span>;
}
