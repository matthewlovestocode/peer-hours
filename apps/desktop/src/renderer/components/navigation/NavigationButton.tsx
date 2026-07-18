type NavigationButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

/** Renders a top-level workspace destination with the active state communicated semantically. */
export function NavigationButton({ active, label, onClick }: NavigationButtonProps) {
  return (
    <button className={`navigation-item ${active ? "navigation-item--active" : ""}`} type="button" onClick={onClick} aria-current={active ? "page" : undefined}>
      {label}
    </button>
  );
}
