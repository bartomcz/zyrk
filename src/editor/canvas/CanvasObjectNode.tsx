import type Konva from "konva";
import { useRef } from "react";
import { Circle, Group, Transformer } from "react-konva";
import type {
  CanvasObject,
  ConnectionEndpoint,
  ObjectFrame,
  ObjectId,
} from "../model/objects";
import { getObjectDefinition } from "../objects/registry";
import { getEdgePoint, OBJECT_EDGES } from "./connections";
import { useObjectTransform } from "./useObjectTransform";

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
  const {
    transformerRef,
    onTransformStart,
    onTransform,
    onTransformEnd,
  } = useObjectTransform({
    object,
    objectRef,
    definition,
    selected,
    editing,
    onPreviewFrame,
    onChange,
  });

  const updateFrame = (frame: ObjectFrame) => {
    onChange(definition.transform.withFrame(object, frame));
  };

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
        onTransformStart={onTransformStart}
        onTransform={onTransform}
        onTransformEnd={(event) => {
          onTransformEnd();
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
