import { useEffect, useRef } from "react";
import type { CanvasObject } from "../model/objects";
import { getObjectDefinition } from "../objects/registry";
import type { CanvasView } from "./CanvasStage";

type EditorOverlayProps = {
  object: CanvasObject;
  view: CanvasView;
  onChange: (
    value: string,
    contentWidth: number,
    contentHeight: number,
  ) => void;
  onFinish: () => void;
  onCancel: () => void;
};

export function EditorOverlay({
  object,
  view,
  onChange,
  onFinish,
  onCancel,
}: EditorOverlayProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const definition = getObjectDefinition(object);
  const textEditor = definition.textEditor;

  useEffect(() => {
    editorRef.current?.focus();
    editorRef.current?.select();
  }, [object.id]);

  if (!textEditor) return null;

  const sharedProps = {
    className: "canvas-text-editor",
    "aria-label": `Edit ${object.type}`,
    autoCorrect: "off",
    spellCheck: false,
    value: textEditor.getValue(object),
    style: {
      left: view.x + object.x * view.scale,
      top: view.y + object.y * view.scale,
      width: object.width,
      height: object.height,
      transform: `scale(${view.scale}) rotate(${object.rotation}deg)`,
      ...textEditor.getStyle(object),
    },
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const editor = event.currentTarget;
      const { width, height, whiteSpace, overflowWrap } = editor.style;
      const borderWidth = editor.offsetWidth - editor.clientWidth;
      const borderHeight = editor.offsetHeight - editor.clientHeight;
      editor.style.height = "0";
      const contentHeight = editor.scrollHeight + borderHeight;
      editor.style.height = height;
      editor.style.width = "0";
      editor.style.whiteSpace = "pre";
      editor.style.overflowWrap = "normal";
      const contentWidth = editor.scrollWidth + borderWidth;
      editor.style.width = width;
      editor.style.whiteSpace = whiteSpace;
      editor.style.overflowWrap = overflowWrap;
      onChange(editor.value, contentWidth, contentHeight);
    },
    onBlur: onFinish,
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    },
  };

  return <textarea {...sharedProps} ref={editorRef} />;
}
