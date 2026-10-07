import type Konva from "konva";
import { useLayoutEffect, useRef, type RefObject } from "react";
import type {
  CanvasObject,
  ObjectFrame,
  ObjectId,
} from "../model/objects";
import {
  EDITABLE_TEXT_NODE_NAME,
  type CanvasObjectDefinition,
} from "../objects/definition";

type UseObjectTransformOptions<TObject extends CanvasObject> = {
  object: TObject;
  objectRef: RefObject<Konva.Group | null>;
  definition: CanvasObjectDefinition<TObject>;
  selected: boolean;
  editing: boolean;
  onPreviewFrame: (id: ObjectId, frame: ObjectFrame | null) => void;
  onChange: (object: TObject) => void;
};

export function useObjectTransform<TObject extends CanvasObject>({
  object,
  objectRef,
  definition,
  selected,
  editing,
  onPreviewFrame,
  onChange,
}: UseObjectTransformOptions<TObject>) {
  const transformerRef = useRef<Konva.Transformer>(null);
  const horizontalResizeRef = useRef(false);
  const resizedWidthRef = useRef<number | null>(null);
  const resizedHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (selected && !editing && objectRef.current && transformerRef.current) {
      transformerRef.current.nodes([objectRef.current]);
      transformerRef.current.forceUpdate();
    }
  }, [editing, object, objectRef, selected]);

  const transformedFrame = (node: Konva.Group): ObjectFrame => ({
    x: node.x(),
    y: node.y(),
    width: horizontalResizeRef.current
      ? (resizedWidthRef.current ?? object.width)
      : Math.max(
          definition.transform.minWidth,
          object.width * Math.abs(node.scaleX()),
        ),
    height: horizontalResizeRef.current
      ? (resizedHeightRef.current ?? object.height)
      : Math.max(
          definition.transform.minHeight,
          object.height * Math.abs(node.scaleY()),
        ),
    rotation: node.rotation(),
  });

  const onTransformStart = () => {
    const anchor = transformerRef.current?.getActiveAnchor();
    horizontalResizeRef.current =
      (anchor === "middle-left" || anchor === "middle-right") &&
      definition.transform.textResize === "reflow-horizontal";
    resizedWidthRef.current = null;
    resizedHeightRef.current = null;
  };

  const onTransform = () => {
    const node = objectRef.current;
    const text = node?.findOne<Konva.Text>(`.${EDITABLE_TEXT_NODE_NAME}`);
    if (!node) return;

    if (text && horizontalResizeRef.current) {
      const width = Math.max(
        definition.transform.minWidth,
        text.width() * Math.abs(node.scaleX()),
      );
      text.width(width);
      text.wrap("word");
      text.height("auto");
      const height = Math.max(definition.transform.minHeight, text.height());
      text.height(height);
      node.scaleX(1);
      resizedWidthRef.current = width;
      resizedHeightRef.current = height;
      transformerRef.current?.forceUpdate();
    } else if (
      text &&
      definition.transform.textResize === "preserve-font-size"
    ) {
      const scaleX = Math.abs(node.scaleX());
      const scaleY = Math.abs(node.scaleY());
      if (scaleX && scaleY) {
        text.width(object.width * scaleX);
        text.height(object.height * scaleY);
        text.scale({ x: 1 / scaleX, y: 1 / scaleY });
      }
    }

    onPreviewFrame(object.id, transformedFrame(node));
  };

  const onTransformEnd = () => {
    const node = objectRef.current;
    if (!node) return;
    const frame = transformedFrame(node);
    const resizeMode = horizontalResizeRef.current ? "reflow" : "scale";

    node.scaleX(1);
    node.scaleY(1);
    if (definition.transform.textResize === "preserve-font-size") {
      node
        .findOne<Konva.Text>(`.${EDITABLE_TEXT_NODE_NAME}`)
        ?.scale({ x: 1, y: 1 });
    }
    horizontalResizeRef.current = false;
    resizedWidthRef.current = null;
    resizedHeightRef.current = null;
    onPreviewFrame(object.id, null);
    onChange(definition.transform.withFrame(object, frame, resizeMode));
  };

  return {
    transformerRef,
    onTransformStart,
    onTransform,
    onTransformEnd,
  };
}
