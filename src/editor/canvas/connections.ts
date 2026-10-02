import type {
  CanvasObject,
  ConnectionEndpoint,
  ObjectEdge,
  ObjectId,
} from "../model/objects";

export type CanvasPoint = { x: number; y: number };

export const OBJECT_EDGES: ObjectEdge[] = ["top", "right", "bottom", "left"];

export function getEdgePoint(
  object: CanvasObject,
  edge: ObjectEdge,
  offset = 0,
): CanvasPoint {
  const local = {
    top: { x: object.width / 2, y: -offset },
    right: { x: object.width + offset, y: object.height / 2 },
    bottom: { x: object.width / 2, y: object.height + offset },
    left: { x: -offset, y: object.height / 2 },
  }[edge];
  const angle = (object.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: object.x + local.x * cos - local.y * sin,
    y: object.y + local.x * sin + local.y * cos,
  };
}

export function findObjectEdgeAt(
  objects: readonly CanvasObject[],
  point: CanvasPoint,
  excludedObjectId: ObjectId,
  tolerance: number,
): ConnectionEndpoint | null {
  for (const object of objects) {
    if (object.id === excludedObjectId) continue;

    const angle = (-object.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - object.x;
    const dy = point.y - object.y;
    const local = {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
    const candidates: [ObjectEdge, number][] = [];

    if (local.x >= -tolerance && local.x <= object.width + tolerance) {
      candidates.push(["top", Math.abs(local.y)]);
      candidates.push(["bottom", Math.abs(local.y - object.height)]);
    }
    if (local.y >= -tolerance && local.y <= object.height + tolerance) {
      candidates.push(["left", Math.abs(local.x)]);
      candidates.push(["right", Math.abs(local.x - object.width)]);
    }

    const nearest = candidates.reduce<[ObjectEdge, number] | null>(
      (best, candidate) => (!best || candidate[1] < best[1] ? candidate : best),
      null,
    );
    if (nearest && nearest[1] <= tolerance) {
      return { objectId: object.id, edge: nearest[0] };
    }
  }

  return null;
}
