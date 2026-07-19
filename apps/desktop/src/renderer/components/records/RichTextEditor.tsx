import { useRef } from "react";

/** Provides a compact Markdown editor with formatting actions while keeping immutable descriptions portable and text-based. */
export function RichTextEditor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const editor = useRef<HTMLTextAreaElement>(null);

  /** Applies a portable formatting marker around the current selection and restores typing focus. */
  const format = (prefix: string, suffix = prefix) => {
    const element = editor.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  return (
    <div className="rich-text-editor">
      <div className="rich-text-editor__toolbar" role="toolbar" aria-label="Description formatting">
        <button type="button" disabled={disabled} onClick={() => format("**")} aria-label="Bold selected text"><strong>B</strong></button>
        <button type="button" disabled={disabled} onClick={() => format("_")} aria-label="Italicize selected text"><em>I</em></button>
        <button type="button" disabled={disabled} onClick={() => format("- ", "")} aria-label="Start a list item">• List</button>
      </div>
      <textarea ref={editor} disabled={disabled} required value={value} onChange={(event) => onChange(event.target.value)} placeholder="Include what help is needed or offered, useful details, and any boundaries or accessibility needs." aria-label="Description" />
      <p>Use the formatting buttons for bold, italic, and lists. Your description is saved as readable text with the listing.</p>
    </div>
  );
}
