import Konva from "konva";
import type {
  TextHeightMeasurer,
  TextMeasurement,
} from "../behavior";

type KonvaTextMeasurement = TextMeasurement & { wrap: "word" };

type MeasuredTextNode = {
  height: () => number;
  destroy: () => void;
};

export function createKonvaTextHeightMeasurer(
  createTextNode: (measurement: KonvaTextMeasurement) => MeasuredTextNode,
): TextHeightMeasurer {
  return (measurement) => {
    const text = createTextNode({ ...measurement, wrap: "word" });
    try {
      return text.height();
    } finally {
      text.destroy();
    }
  };
}

export const measureTextHeightWithKonva = createKonvaTextHeightMeasurer(
  (measurement) => new Konva.Text(measurement),
);
