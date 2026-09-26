import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Group, Layer, Rect, Shape, Stage, Text } from "react-konva";
import "./App.css";

const GRID_SIZE = 40;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const TEXT_WIDTH = 240;
const TEXT_HEIGHT = 44;
const TEXT_FONT_SIZE = 28;

type View = { x: number; y: number; scale: number };
type CanvasText = { id: number; text: string; x: number; y: number };
type TextEditor = { id: number; value: string };

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
  const [texts, setTexts] = useState<CanvasText[]>([
    { id: 1, text: "Hello world", x: -TEXT_WIDTH / 2, y: -TEXT_HEIGHT / 2 },
  ]);
  const [selectedTextId, setSelectedTextId] = useState<number | null>(null);
  const [editor, setEditor] = useState<TextEditor | null>(null);
  const nextTextId = useRef(2);
  const editorInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const resize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (!editor) return;

    editorInput.current?.focus();
    editorInput.current?.select();
  }, [editor?.id]);

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

  const addText = () => {
    const id = nextTextId.current++;
    const stagger = ((texts.length - 1) % 6) * 12;
    const center = {
      x: (size.width / 2 - view.x) / view.scale,
      y: (size.height / 2 - view.y) / view.scale,
    };

    setTexts((current) => [
      ...current,
      {
        id,
        text: "Text",
        x: center.x - TEXT_WIDTH / 2 + stagger,
        y: center.y - TEXT_HEIGHT / 2 + stagger,
      },
    ]);
    setSelectedTextId(id);
  };

  const beginEditing = (item: CanvasText) => {
    setSelectedTextId(item.id);
    setEditor({ id: item.id, value: item.text });
  };

  const finishEditing = () => {
    if (!editor) return;

    const nextValue = editor.value.trim() || "Text";
    setTexts((current) =>
      current.map((item) =>
        item.id === editor.id ? { ...item, text: nextValue } : item,
      ),
    );
    setEditor(null);
  };

  const cancelEditing = () => setEditor(null);

  const updateTextPosition = (id: number, x: number, y: number) => {
    setTexts((current) =>
      current.map((item) => (item.id === id ? { ...item, x, y } : item)),
    );
  };

  const setCanvasCursor = (
    event: Konva.KonvaEventObject<MouseEvent>,
    cursor: string,
  ) => {
    const stage = event.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  const left = -view.x / view.scale;
  const top = -view.y / view.scale;
  const right = left + size.width / view.scale;
  const bottom = top + size.height / view.scale;
  const editedText = editor
    ? texts.find((item) => item.id === editor.id)
    : undefined;

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
        onDragMove={(event) => {
          if (event.target !== event.currentTarget) return;

          setView((current) => ({
            ...current,
            x: event.target.x(),
            y: event.target.y(),
          }));
        }}
        onWheel={zoom}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedTextId(null);
        }}
        onTap={(event) => {
          if (event.target === event.currentTarget) setSelectedTextId(null);
        }}
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

          {texts.map((item) => (
            <Group
              key={item.id}
              x={item.x}
              y={item.y}
              draggable={
                selectedTextId === item.id && editor?.id !== item.id
              }
              onClick={(event) => {
                setSelectedTextId(item.id);
                setCanvasCursor(event, "move");
              }}
              onTap={() => setSelectedTextId(item.id)}
              onDblClick={() => beginEditing(item)}
              onDblTap={() => beginEditing(item)}
              onDragStart={(event) => {
                setSelectedTextId(item.id);
                setCanvasCursor(event, "grabbing");
              }}
              onDragEnd={(event) => {
                updateTextPosition(item.id, event.target.x(), event.target.y());
                setCanvasCursor(event, "move");
              }}
              onMouseEnter={(event) =>
                setCanvasCursor(
                  event,
                  selectedTextId === item.id ? "move" : "grab",
                )
              }
              onMouseLeave={(event) => setCanvasCursor(event, "grab")}
            >
              {selectedTextId === item.id && (
                <Rect
                  x={-4}
                  y={-4}
                  width={TEXT_WIDTH + 8}
                  height={TEXT_HEIGHT + 8}
                  fill="rgba(79, 70, 229, 0.06)"
                  stroke="#4f46e5"
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  cornerRadius={6}
                  listening={false}
                />
              )}
              <Text
                text={item.text}
                width={TEXT_WIDTH}
                height={TEXT_HEIGHT}
                align="center"
                verticalAlign="middle"
                fontSize={TEXT_FONT_SIZE}
                fontFamily="sans-serif"
                fill="#171717"
                visible={editor?.id !== item.id}
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      {editor && editedText && (
        <input
          ref={editorInput}
          className="canvas-text-editor"
          aria-label="Edit canvas text"
          value={editor.value}
          style={{
            left: view.x + editedText.x * view.scale,
            top: view.y + editedText.y * view.scale,
            transform: `scale(${view.scale})`,
          }}
          onChange={(event) =>
            setEditor((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") finishEditing();
            if (event.key === "Escape") cancelEditing();
          }}
        />
      )}

      <aside className="tool-panel" aria-label="Canvas tools">
        <button
          className="tool-button"
          type="button"
          aria-label="Add text"
          title="Add text"
          onClick={addText}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
          >
            <path d="M5 5h14M12 5v14M8.5 19h7" />
          </svg>
        </button>
      </aside>
    </main>
  );
}
