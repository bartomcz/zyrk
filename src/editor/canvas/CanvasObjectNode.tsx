import type Konva from "konva";
import { useLayoutEffect, useRef } from "react";
import { Group, Transformer } from "react-konva";
import type {
  CanvasObject,
  ObjectFrame,
  ObjectId,
} from "../model/objects";
import { getObjectDefinition } from "../objects/registry";

type CanvasObjectNodeProps = {
  object: CanvasObject;
  selected: boolean;
  editing: boolean;
  onSelect: (id: ObjectId) => void;
  onBeginEditing: (id: ObjectId) => void;
  onChange: (object: CanvasObject) => void;
};

function setCanvasCursor(
  event: Konva.KonvaEventObject<Event>,
  cursor: string,
) {
  const stage = event.target.getStage();
  if (stage) stage.container().style.cursor = cursor;
}

export function CanvasObjectNode({
  object,
  selected,
  editing,
  onSelect,
  onBeginEditing,
  onChange,
}: CanvasObjectNodeProps) {
  const definition = getObjectDefinition(object);
  const Renderer = definition.Renderer;
  const objectRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useLayoutEffect(() => {
    if (selected && !editing && objectRef.current && transformerRef.current) {
      transformerRef.current.nodes([objectRef.current]);
      transformerRef.current.forceUpdate();
    }
  }, [editing, object, selected]);

  const updateFrame = (frame: ObjectFrame) => {
    onChange(definition.transform.withFrame(object, frame));
  };

  return (
    <>
      <Group
        ref={objectRef}
        id={`canvas-object-${object.id}`}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        draggable={selected && !editing}
        onClick={(event) => {
          onSelect(object.id);
          setCanvasCursor(event, "move");
        }}
        onTap={() => onSelect(object.id)}
        onDblClick={() => {
          if (definition.textEditor) onBeginEditing(object.id);
        }}
        onDblTap={() => {
          if (definition.textEditor) onBeginEditing(object.id);
        }}
        onDragStart={(event) => {
          onSelect(object.id);
          setCanvasCursor(event, "grabbing");
        }}
        onDragEnd={(event) => {
          updateFrame({
            x: event.target.x(),
            y: event.target.y(),
            width: object.width,
            height: object.height,
            rotation: object.rotation,
          });
          setCanvasCursor(event, "move");
        }}
        onTransformEnd={(event) => {
          const node = event.target;
          const width = Math.max(
            definition.transform.minWidth,
            object.width * Math.abs(node.scaleX()),
          );
          const height = Math.max(
            definition.transform.minHeight,
            object.height * Math.abs(node.scaleY()),
          );

          node.scaleX(1);
          node.scaleY(1);
          updateFrame({
            x: node.x(),
            y: node.y(),
            width,
            height,
            rotation: node.rotation(),
          });
          setCanvasCursor(event, "move");
        }}
        onMouseEnter={(event) =>
          setCanvasCursor(event, selected ? "move" : "grab")
        }
        onMouseLeave={(event) => setCanvasCursor(event, "grab")}
      >
        <Renderer object={object} editing={editing} />
      </Group>
      {selected && !editing && (
        <Transformer
          ref={transformerRef}
          resizeEnabled={definition.transform.canResize}
          rotateEnabled={false}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          flipEnabled={false}
          keepRatio={true}
          borderStroke="#4f46e5"
          borderStrokeWidth={1.5}
          anchorFill="#fff"
          anchorStroke="#4f46e5"
          anchorStrokeWidth={1.5}
          anchorSize={10}
          anchorCornerRadius={2}
        />
      )}
    </>
  );
}
