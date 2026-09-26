import type Konva from "konva";
import { Group, Rect } from "react-konva";
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
  event: Konva.KonvaEventObject<MouseEvent>,
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

  const updateFrame = (frame: ObjectFrame) => {
    onChange(definition.transform.withFrame(object, frame));
  };

  return (
    <Group
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
      onMouseEnter={(event) =>
        setCanvasCursor(event, selected ? "move" : "grab")
      }
      onMouseLeave={(event) => setCanvasCursor(event, "grab")}
    >
      {selected && (
        <Rect
          x={-4}
          y={-4}
          width={object.width + 8}
          height={object.height + 8}
          fill="rgba(79, 70, 229, 0.06)"
          stroke="#4f46e5"
          strokeWidth={1.5}
          strokeScaleEnabled={false}
          cornerRadius={6}
          listening={false}
        />
      )}
      <Renderer object={object} editing={editing} />
    </Group>
  );
}
