import { useEffect, useState } from "react";
import type Konva from "konva";
import { Layer, Shape, Stage, Text } from "react-konva";
import "./App.css";

const GRID_SIZE = 40;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

type View = { x: number; y: number; scale: number };

export default function App() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [view, setView] = useState<View>(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1,
  }));

  useEffect(() => {
    const resize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

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

    setView({
      x: pointer.x - point.x * scale,
      y: pointer.y - point.y * scale,
      scale,
    });
  };

  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + size.width / view.scale;
  const bottom = top + size.height / view.scale;

  return (
    <main aria-label="Zoomable canvas">
      <Stage
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable
        onDragMove={({ target }) =>
          setView((current) => ({
            ...current,
            x: target.x(),
            y: target.y(),
          }))
        }
        onWheel={zoom}
      >
        <Layer>
          <Shape
            listening={false}
            stroke="#d9dde3"
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
          <Text
            text="Hello world"
            x={-150}
            y={-20}
            width={300}
            height={40}
            align="center"
            verticalAlign="middle"
            fontSize={32}
            fontFamily="sans-serif"
            fill="#171717"
          />
        </Layer>
      </Stage>
    </main>
  );
}
