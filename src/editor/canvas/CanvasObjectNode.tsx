import type Konva from "konva";
import { useLayoutEffect, useRef } from "react";
import { Circle, Group, Transformer } from "react-konva";
import type {
  CanvasObject,
  ConnectionEndpoint,
  ObjectFrame,
  ObjectId,
} from "../model/objects";
import { getObjectDefinition } from "../objects/registry";
import { getEdgePoint, OBJECT_EDGES } from "./connections";

type CanvasObjectNodeProps = {
  object: CanvasObject;
  selected: boolean;
  editing: boolean;
  viewScale: number;
  liveFrame?: ObjectFrame;
  onSelect: (id: ObjectId) => void;
  onBeginEditing: (id: ObjectId) => void;
  onBeginConnection: (from: ConnectionEndpoint) => void;
  onPreviewFrame: (id: ObjectId, frame: ObjectFrame | null) => void;
  onChange: (object: CanvasObject) => void;
};

function setCanvasCursor(
  event: Konva.KonvaEventObject<Event>,
  cursor: string,
) {
  const stage = event.target.getStage();
  if (stage) stage.getContent().style.cursor = cursor;
}

export function CanvasObjectNode({
  object,
  selected,
  editing,
  viewScale,
  liveFrame,
  onSelect,
  onBeginEditing,
  onBeginConnection,
  onPreviewFrame,
  onChange,
}: CanvasObjectNodeProps) {
  const definition = getObjectDefinition(object);
  const Renderer = definition.Renderer;
  const objectRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const horizontalResizeRef = useRef(false);
  const resizedWidthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (selected && !editing && objectRef.current && transformerRef.current) {
      transformerRef.current.nodes([objectRef.current]);
      transformerRef.current.forceUpdate();
    }
  }, [editing, object, selected]);

  const updateFrame = (frame: ObjectFrame) => {
    onChange(definition.transform.withFrame(object, frame));
  };

  const transformedFrame = (node: Konva.Group): ObjectFrame => ({
    x: node.x(),
    y: node.y(),
    width: horizontalResizeRef.current
      ? (resizedWidthRef.current ?? object.width)
      : Math.max(
          definition.transform.minWidth,
          object.width * Math.abs(node.scaleX()),
        ),
    height: Math.max(
      definition.transform.minHeight,
      object.height * Math.abs(node.scaleY()),
    ),
    rotation: node.rotation(),
  });

  const displayedObject: CanvasObject = liveFrame
    ? { ...object, ...liveFrame }
    : object;

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
        onDragMove={(event) => {
          onPreviewFrame(object.id, {
            x: event.target.x(),
            y: event.target.y(),
            width: object.width,
            height: object.height,
            rotation: object.rotation,
          });
        }}
        onDragEnd={(event) => {
          const frame = {
            x: event.target.x(),
            y: event.target.y(),
            width: object.width,
            height: object.height,
            rotation: object.rotation,
          };
          onPreviewFrame(object.id, null);
          updateFrame(frame);
          setCanvasCursor(event, "move");
        }}
        onTransformStart={() => {
          const anchor = transformerRef.current?.getActiveAnchor();
          horizontalResizeRef.current =
            (anchor === "middle-left" || anchor === "middle-right") &&
            definition.textEditor?.resizeBehavior === "scale";
          resizedWidthRef.current = null;
        }}
        onTransform={() => {
          const node = objectRef.current;
          const text = node?.findOne<Konva.Text>(".editable-text");
          if (!node) return;

          if (text && horizontalResizeRef.current) {
            const width = Math.max(
              definition.transform.minWidth,
              text.width() * Math.abs(node.scaleX()),
            );
            text.width(width);
            node.scaleX(1);
            resizedWidthRef.current = width;
            transformerRef.current?.forceUpdate();
          } else if (text && definition.textEditor?.resizeBehavior === "fixed") {
            const scaleX = Math.abs(node.scaleX());
            const scaleY = Math.abs(node.scaleY());
            if (scaleX && scaleY) {
              text.width(object.width * scaleX);
              text.height(object.height * scaleY);
              text.scale({ x: 1 / scaleX, y: 1 / scaleY });
            }
          }

          onPreviewFrame(object.id, transformedFrame(node));
        }}
        onTransformEnd={(event) => {
          const node = objectRef.current;
          if (!node) return;
          const frame = transformedFrame(node);

          node.scaleX(1);
          node.scaleY(1);
          if (definition.textEditor?.resizeBehavior === "fixed") {
            objectRef.current
              ?.findOne<Konva.Text>(".editable-text")
              ?.scale({ x: 1, y: 1 });
          }
          horizontalResizeRef.current = false;
          resizedWidthRef.current = null;
          onPreviewFrame(object.id, null);
          updateFrame(frame);
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
        <>
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            keepRatio={definition.transform.keepRatio}
            enabledAnchors={[
              "top-left",
              "top-right",
              "bottom-left",
              "bottom-right",
              "middle-left",
              "middle-right",
            ]}
            flipEnabled={false}
            borderStroke="#4f46e5"
            borderStrokeWidth={1.5}
            anchorFill="#fff"
            anchorStroke="#4f46e5"
            anchorStrokeWidth={1.5}
            anchorSize={10}
            anchorCornerRadius={2}
          />
          {OBJECT_EDGES.map((edge) => {
            const point = getEdgePoint(displayedObject, edge, 14 / viewScale);
            return (
              <Circle
                key={edge}
                x={point.x}
                y={point.y}
                radius={6 / viewScale}
                fill="#fff"
                stroke="#4f46e5"
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  onBeginConnection({ objectId: object.id, edge });
                }}
                onMouseEnter={(event) => setCanvasCursor(event, "pointer")}
                onMouseLeave={(event) => setCanvasCursor(event, "move")}
              />
            );
          })}
        </>
      )}
    </>
  );
}
