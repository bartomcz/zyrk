import type { ObjectFrame } from "../model/objects";

export type CanvasPoint = { x: number; y: number };

export function getFrameCenter(frame: ObjectFrame): CanvasPoint {
  const angle = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: frame.x + (frame.width / 2) * cos - (frame.height / 2) * sin,
    y: frame.y + (frame.width / 2) * sin + (frame.height / 2) * cos,
  };
}

export function frameFromCenter(
  center: CanvasPoint,
  size: { width: number; height: number },
  rotation: number,
): ObjectFrame {
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: center.x - (size.width / 2) * cos + (size.height / 2) * sin,
    y: center.y - (size.width / 2) * sin - (size.height / 2) * cos,
    ...size,
    rotation,
  };
}
