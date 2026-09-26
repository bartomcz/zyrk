import { useEffect, useRef } from "react";
import type { CanvasObject } from "../model/objects";
import { getObjectDefinition } from "../objects/registry";
import type { CanvasView } from "./CanvasStage";

type EditorOverlayProps = {
  object: CanvasObject;
  view: CanvasView;
  onChange: (value: string) => void;
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
  const editorRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
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
    value: textEditor.getValue(object),
    style: {
      left: view.x + object.x * view.scale,
      top: view.y + object.y * view.scale,
      width: object.width,
      height: object.height,
      transform: `scale(${view.scale}) rotate(${object.rotation}deg)`,
      ...textEditor.getStyle(object),
    },
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
    onBlur: onFinish,
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter" && !textEditor.multiline) {
        event.preventDefault();
        onFinish();
      }
    },
  };

  if (textEditor.multiline) {
    return (
      <textarea
        {...sharedProps}
        ref={(element) => {
          editorRef.current = element;
        }}
      />
    );
  }

  return (
    <input
      {...sharedProps}
      ref={(element) => {
        editorRef.current = element;
      }}
    />
  );
}
