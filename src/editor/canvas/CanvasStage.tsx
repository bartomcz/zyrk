import type Konva from "konva";
import { useState } from "react";
import { Arrow, Layer, Shape, Stage } from "react-konva";
import type { CanvasDocument } from "../model/document";
import type {
  CanvasObject,
  ConnectionEndpoint,
  ObjectFrame,
  ObjectId,
} from "../model/objects";
import { CanvasObjectNode } from "./CanvasObjectNode";
import {
  findObjectEdgeAt,
  getEdgePoint,
  type CanvasPoint,
} from "./connections";

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
  onConnect: (from: ConnectionEndpoint, to: ConnectionEndpoint) => void;
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
  onConnect,
  onChangeObject,
}: CanvasStageProps) {
  const [pendingConnection, setPendingConnection] = useState<{
    from: ConnectionEndpoint;
    pointer: CanvasPoint;
  } | null>(null);
  const [liveFrames, setLiveFrames] = useState<Record<ObjectId, ObjectFrame>>(
    {},
  );
  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + size.width / view.scale;
  const bottom = top + size.height / view.scale;

  const displayedObject = (object: CanvasObject): CanvasObject => {
    const frame = liveFrames[object.id];
    return frame ? { ...object, ...frame } : object;
  };

  const previewFrame = (id: ObjectId, frame: ObjectFrame | null) => {
    setLiveFrames((current) => {
      if (frame) return { ...current, [id]: frame };
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const getWorldPointer = (stage: Konva.Stage | null): CanvasPoint | null => {
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  };

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
      draggable={!pendingConnection}
      onDragMove={(event) => {
        if (event.target !== event.currentTarget) return;

        onViewChange({
          ...view,
          x: event.target.x(),
          y: event.target.y(),
        });
      }}
      onWheel={zoom}
      onMouseMove={(event) => {
        if (!pendingConnection) return;
        const pointer = getWorldPointer(event.target.getStage());
        if (pointer) setPendingConnection({ ...pendingConnection, pointer });
      }}
      onMouseUp={(event) => {
        if (!pendingConnection) return;
        const pointer = getWorldPointer(event.target.getStage());
        const target =
          pointer &&
          findObjectEdgeAt(
            [...document.order]
              .reverse()
              .map((id) => document.objects[id])
              .filter((object): object is CanvasObject => Boolean(object)),
            pointer,
            pendingConnection.from.objectId,
            10 / view.scale,
          );
        if (target) onConnect(pendingConnection.from, target);
        setPendingConnection(null);
      }}
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
        {document.connections.map((connection) => {
          const storedFromObject = document.objects[connection.from.objectId];
          const storedToObject = document.objects[connection.to.objectId];
          if (!storedFromObject || !storedToObject) return null;
          const from = getEdgePoint(
            displayedObject(storedFromObject),
            connection.from.edge,
          );
          const to = getEdgePoint(
            displayedObject(storedToObject),
            connection.to.edge,
          );

          return (
            <Arrow
              key={connection.id}
              points={[from.x, from.y, to.x, to.y]}
              stroke="#4f46e5"
              fill="#4f46e5"
              strokeWidth={2}
              strokeScaleEnabled={false}
              pointerLength={10 / view.scale}
              pointerWidth={10 / view.scale}
              listening={false}
            />
          );
        })}
        {document.order.map((id) => {
          const object = document.objects[id];
          if (!object) return null;

          return (
            <CanvasObjectNode
              key={object.id}
              object={object}
              selected={selectedObjectId === object.id}
              editing={editingObjectId === object.id}
              viewScale={view.scale}
              liveFrame={liveFrames[object.id]}
              onSelect={onSelectObject}
              onBeginEditing={onBeginEditing}
              onBeginConnection={(from) => {
                const source = document.objects[from.objectId];
                if (!source) return;
                setPendingConnection({
                  from,
                  pointer: getEdgePoint(source, from.edge),
                });
              }}
              onPreviewFrame={previewFrame}
              onChange={onChangeObject}
            />
          );
        })}
      </Layer>

      {pendingConnection && (
        <Layer listening={false}>
          {(() => {
            const source = document.objects[pendingConnection.from.objectId];
            if (!source) return null;
            const from = getEdgePoint(
              displayedObject(source),
              pendingConnection.from.edge,
            );
            return (
              <Arrow
                points={[
                  from.x,
                  from.y,
                  pendingConnection.pointer.x,
                  pendingConnection.pointer.y,
                ]}
                stroke="#4f46e5"
                fill="#4f46e5"
                strokeWidth={2}
                strokeScaleEnabled={false}
                pointerLength={10 / view.scale}
                pointerWidth={10 / view.scale}
                dash={[8 / view.scale, 6 / view.scale]}
              />
            );
          })()}
        </Layer>
      )}
    </Stage>
  );
}
