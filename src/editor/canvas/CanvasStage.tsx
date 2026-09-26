import type Konva from "konva";
import { Layer, Shape, Stage } from "react-konva";
import type { CanvasDocument } from "../model/document";
import type { CanvasObject, ObjectId } from "../model/objects";
import { CanvasObjectNode } from "./CanvasObjectNode";

const GRID_SIZE = 100;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

export type CanvasView = { x: number; y: number; scale: number };
export type ViewportSize = { width: number; height: number };

type CanvasStageProps = {
  size: ViewportSize;
  view: CanvasView;
  document: CanvasDocument;
  selectedObjectId: ObjectId | null;
  editingObjectId: ObjectId | null;
  onViewChange: (view: CanvasView) => void;
  onSelectObject: (id: ObjectId | null) => void;
  onBeginEditing: (id: ObjectId) => void;
  onChangeObject: (object: CanvasObject) => void;
};

export function CanvasStage({
  size,
  view,
  document,
  selectedObjectId,
  editingObjectId,
  onViewChange,
  onSelectObject,
  onBeginEditing,
  onChangeObject,
}: CanvasStageProps) {
  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + size.width / view.scale;
  const bottom = top + size.height / view.scale;

  const zoom = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;

    const scale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, stage.scaleX() * Math.exp(-event.evt.deltaY * 0.001)),
    );
    const point = {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };

    onViewChange({
      x: pointer.x - point.x * scale,
      y: pointer.y - point.y * scale,
      scale,
    });
  };

  return (
    <Stage
      width={size.width}
      height={size.height}
      x={view.x}
      y={view.y}
      scaleX={view.scale}
      scaleY={view.scale}
      draggable
      onDragMove={(event) => {
        if (event.target !== event.currentTarget) return;

        onViewChange({
          ...view,
          x: event.target.x(),
          y: event.target.y(),
        });
      }}
      onWheel={zoom}
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelectObject(null);
      }}
      onTap={(event) => {
        if (event.target === event.currentTarget) onSelectObject(null);
      }}
    >
      <Layer listening={false}>
        <Shape
          stroke="#e8ebf0"
          strokeWidth={1}
          strokeScaleEnabled={false}
          sceneFunc={(context, shape) => {
            context.beginPath();
            for (
              let x = Math.floor(left / GRID_SIZE) * GRID_SIZE;
              x <= right;
              x += GRID_SIZE
            ) {
              context.moveTo(x, top);
              context.lineTo(x, bottom);
            }
            for (
              let y = Math.floor(top / GRID_SIZE) * GRID_SIZE;
              y <= bottom;
              y += GRID_SIZE
            ) {
              context.moveTo(left, y);
              context.lineTo(right, y);
            }
            context.strokeShape(shape);
          }}
        />
      </Layer>

      <Layer>
        {document.order.map((id) => {
          const object = document.objects[id];
          if (!object) return null;

          return (
            <CanvasObjectNode
              key={object.id}
              object={object}
              selected={selectedObjectId === object.id}
              editing={editingObjectId === object.id}
              onSelect={onSelectObject}
              onBeginEditing={onBeginEditing}
              onChange={onChangeObject}
            />
          );
        })}
      </Layer>
    </Stage>
  );
}
