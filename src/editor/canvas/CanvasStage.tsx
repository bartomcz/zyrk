import type Konva from "konva";
import { useState } from "react";
import { Arrow, Layer, Rect, Shape, Stage } from "react-konva";
import type { CanvasDocument } from "../model/document";
import type {
  CanvasConnection,
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
  selectedConnectionId: string | null;
  editingObjectId: ObjectId | null;
  onViewChange: (view: CanvasView) => void;
  onPlaceObject?: (point: CanvasPoint) => void;
  onSelectObject: (id: ObjectId | null) => void;
  onSelectConnection: (id: string) => void;
  onBeginEditing: (id: ObjectId) => void;
  onConnect: (from: ConnectionEndpoint, to: ConnectionEndpoint) => void;
  onChangeConnection: (connection: CanvasConnection) => void;
  onChangeObject: (object: CanvasObject) => void;
};

export function CanvasStage({
  size,
  view,
  document,
  selectedObjectId,
  selectedConnectionId,
  editingObjectId,
  onViewChange,
  onPlaceObject,
  onSelectObject,
  onSelectConnection,
  onBeginEditing,
  onConnect,
  onChangeConnection,
  onChangeObject,
}: CanvasStageProps) {
  const [pendingConnection, setPendingConnection] = useState<{
    connectionId: string | null;
    endpoint: "from" | "to";
    fixed: ConnectionEndpoint;
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

  const getWorldPointer = (stage: Konva.Stage | null): CanvasPoint | null =>
    stage?.getRelativePointerPosition() ?? null;

  const getConnectionPoints = (connection: CanvasConnection) => {
    const fromObject = document.objects[connection.from.objectId];
    const toObject = document.objects[connection.to.objectId];
    if (!fromObject || !toObject) return null;

    const moving =
      pendingConnection?.connectionId === connection.id
        ? pendingConnection
        : null;
    return {
      from:
        moving?.endpoint === "from"
          ? moving.pointer
          : getEdgePoint(displayedObject(fromObject), connection.from.edge),
      to:
        moving?.endpoint === "to"
          ? moving.pointer
          : getEdgePoint(displayedObject(toObject), connection.to.edge),
    };
  };

  const handleCanvasPress = (event: Konva.KonvaEventObject<Event>) => {
    if (onPlaceObject) {
      const pointer = getWorldPointer(event.target.getStage());
      if (pointer) onPlaceObject(pointer);
    } else if (event.target === event.currentTarget) {
      onSelectObject(null);
    }
  };

  const selectedConnection = document.connections.find(
    ({ id }) => id === selectedConnectionId,
  );
  const selectedConnectionPoints = selectedConnection
    ? getConnectionPoints(selectedConnection)
    : null;

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
            pendingConnection.fixed.objectId,
            10 / view.scale,
          );
        if (target) {
          if (pendingConnection.connectionId) {
            const connection = document.connections.find(
              ({ id }) => id === pendingConnection.connectionId,
            );
            if (connection) {
              onChangeConnection({
                ...connection,
                [pendingConnection.endpoint]: target,
              });
            }
          } else {
            onConnect(pendingConnection.fixed, target);
          }
        }
        setPendingConnection(null);
      }}
      onClick={handleCanvasPress}
      onTap={handleCanvasPress}
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
          const points = getConnectionPoints(connection);
          if (!points) return null;
          const color =
            selectedConnectionId === connection.id ? "#4f46e5" : "#171717";

          return (
            <Arrow
              key={connection.id}
              points={[
                points.from.x,
                points.from.y,
                points.to.x,
                points.to.y,
              ]}
              stroke={color}
              fill={color}
              strokeWidth={2}
              strokeScaleEnabled={false}
              hitStrokeWidth={12 / view.scale}
              pointerLength={10 / view.scale}
              pointerWidth={10 / view.scale}
              onClick={() => onSelectConnection(connection.id)}
              onTap={() => onSelectConnection(connection.id)}
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
                  connectionId: null,
                  endpoint: "to",
                  fixed: from,
                  pointer: getEdgePoint(source, from.edge),
                });
              }}
              onPreviewFrame={previewFrame}
              onChange={onChangeObject}
            />
          );
        })}
      </Layer>

      {selectedConnection && selectedConnectionPoints && (
        <Layer>
          {(["from", "to"] as const).map((endpoint) => {
            const point = selectedConnectionPoints[endpoint];
            return (
              <Rect
                key={endpoint}
                x={point.x}
                y={point.y}
                width={10 / view.scale}
                height={10 / view.scale}
                offsetX={5 / view.scale}
                offsetY={5 / view.scale}
                cornerRadius={2 / view.scale}
                fill="#fff"
                stroke="#4f46e5"
                strokeWidth={1.5}
                strokeScaleEnabled={false}
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  setPendingConnection({
                    connectionId: selectedConnection.id,
                    endpoint,
                    fixed:
                      selectedConnection[
                        endpoint === "from" ? "to" : "from"
                      ],
                    pointer: point,
                  });
                }}
              />
            );
          })}
        </Layer>
      )}

      {pendingConnection && !pendingConnection.connectionId && (
        <Layer listening={false}>
          {(() => {
            const source = document.objects[pendingConnection.fixed.objectId];
            if (!source) return null;
            const from = getEdgePoint(
              displayedObject(source),
              pendingConnection.fixed.edge,
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
