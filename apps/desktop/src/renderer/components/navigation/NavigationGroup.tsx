import type { ReactNode } from "react";

type NavigationGroupProps = {
  children: ReactNode;
  expanded: boolean;
  label: string;
  onToggle: () => void;
};

/** Renders a disclosure group that keeps future nested workspaces visually organized. */
export function NavigationGroup({ children, expanded, label, onToggle }: NavigationGroupProps) {
  return (
    <div className="navigation-group">
      <button className="navigation-item navigation-item--group" type="button" onClick={onToggle} aria-expanded={expanded}>
        {label}
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && <div className="navigation-group__children">{children}</div>}
    </div>
  );
}
