import type { CanvasDocument } from "../model/document";
import {
  createObjectId,
  type CanvasConnection,
  type CanvasObject,
  type ObjectEdge,
} from "../model/objects";
import { parseCanvasDocumentValue } from "../model/schema";
import {
  createCanvasObject,
  objectDefinitions,
  resizeCanvasObject,
} from "../objects/registry";
import type { DocumentCommand } from "./commands";

export const AUTOMATION_API_VERSION = 1 as const;

type AutomationObjectSize = {
  width?: number;
  height?: number;
};

export type AutomationRequest =
  | {
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.get";
    }
  | {
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.object.add";
      objectType: "text" | "rectangle";
      center: { x: number; y: number };
      text?: string;
      size?: AutomationObjectSize;
    }
  | {
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.object.resize";
      objectId: string;
      size: AutomationObjectSize;
    }
  | {
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.connection.add";
      from: { objectId: string; edge: ObjectEdge };
      to: { objectId: string; edge: ObjectEdge };
    };

export type AutomationResponse =
  | {
      ok: true;
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.get";
      document: CanvasDocument;
    }
  | {
      ok: true;
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.object.add";
      object: CanvasObject;
    }
  | {
      ok: true;
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.object.resize";
      object: CanvasObject;
    }
  | {
      ok: true;
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.connection.add";
      connection: CanvasConnection;
    }
  | {
      ok: false;
      apiVersion: typeof AUTOMATION_API_VERSION;
      error: {
        code: "invalid_request" | "internal_error";
        message: string;
      };
    };

export type AutomationService = {
  execute(request: unknown): AutomationResponse;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isCanvasGetRequest(value: unknown): value is AutomationRequest {
  return (
    isRecord(value) &&
    value.apiVersion === AUTOMATION_API_VERSION &&
    value.operation === "canvas.get" &&
    hasOnlyKeys(value, ["apiVersion", "operation"])
  );
}

function isObjectSize(value: unknown): value is AutomationObjectSize {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["width", "height"]) ||
    (value.width === undefined && value.height === undefined)
  ) {
    return false;
  }

  return [value.width, value.height].every(
    (dimension) =>
      dimension === undefined ||
      (typeof dimension === "number" &&
        Number.isFinite(dimension) &&
        dimension > 0),
  );
}

function objectSupportsSize(
  objectType: "text" | "rectangle",
  size: AutomationObjectSize,
): boolean {
  const transform = objectDefinitions[objectType].transform;
  return (
    (size.width === undefined || size.width >= transform.minWidth) &&
    (size.height === undefined ||
      (objectType === "rectangle" && size.height >= transform.minHeight))
  );
}

function isCanvasObjectAddRequest(
  value: unknown,
): value is Extract<AutomationRequest, { operation: "canvas.object.add" }> {
  if (
    !isRecord(value) ||
    value.apiVersion !== AUTOMATION_API_VERSION ||
    value.operation !== "canvas.object.add" ||
    (value.objectType !== "text" && value.objectType !== "rectangle") ||
    !isRecord(value.center) ||
    typeof value.center.x !== "number" ||
    !Number.isFinite(value.center.x) ||
    typeof value.center.y !== "number" ||
    !Number.isFinite(value.center.y) ||
    !hasOnlyKeys(value.center, ["x", "y"]) ||
    !hasOnlyKeys(value, [
      "apiVersion",
      "operation",
      "objectType",
      "center",
      "text",
      "size",
    ]) ||
    (value.text !== undefined && typeof value.text !== "string") ||
    (value.size !== undefined &&
      (!isObjectSize(value.size) ||
        !objectSupportsSize(value.objectType, value.size)))
  ) {
    return false;
  }

  return value.objectType === "rectangle" || Boolean(value.text?.trim());
}

function isCanvasObjectResizeRequest(
  value: unknown,
): value is Extract<AutomationRequest, { operation: "canvas.object.resize" }> {
  return (
    isRecord(value) &&
    value.apiVersion === AUTOMATION_API_VERSION &&
    value.operation === "canvas.object.resize" &&
    typeof value.objectId === "string" &&
    Boolean(value.objectId) &&
    isObjectSize(value.size) &&
    hasOnlyKeys(value, ["apiVersion", "operation", "objectId", "size"])
  );
}

function isObjectEdge(value: unknown): value is ObjectEdge {
  return (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

function isConnectionEndpoint(
  value: unknown,
): value is { objectId: string; edge: ObjectEdge } {
  return (
    isRecord(value) &&
    typeof value.objectId === "string" &&
    Boolean(value.objectId) &&
    isObjectEdge(value.edge) &&
    hasOnlyKeys(value, ["objectId", "edge"])
  );
}

function isCanvasConnectionAddRequest(
  value: unknown,
): value is Extract<AutomationRequest, { operation: "canvas.connection.add" }> {
  return (
    isRecord(value) &&
    value.apiVersion === AUTOMATION_API_VERSION &&
    value.operation === "canvas.connection.add" &&
    isConnectionEndpoint(value.from) &&
    isConnectionEndpoint(value.to) &&
    value.from.objectId !== value.to.objectId &&
    hasOnlyKeys(value, ["apiVersion", "operation", "from", "to"])
  );
}

function invalidRequest(): AutomationResponse {
  return {
    ok: false,
    apiVersion: AUTOMATION_API_VERSION,
    error: {
      code: "invalid_request",
      message: "Expected a supported version 1 automation request",
    },
  };
}

export function createAutomationService(
  getDocument: () => CanvasDocument,
  applyCommand: (command: DocumentCommand) => void,
): AutomationService {
  return {
    execute(request) {
      if (isCanvasGetRequest(request)) {
        try {
          const document = parseCanvasDocumentValue(getDocument());
          return {
            ok: true,
            apiVersion: AUTOMATION_API_VERSION,
            operation: "canvas.get",
            document,
          };
        } catch {
          return {
            ok: false,
            apiVersion: AUTOMATION_API_VERSION,
            error: {
              code: "internal_error",
              message: "The active canvas is invalid",
            },
          };
        }
      }

      if (isCanvasObjectAddRequest(request)) {
        try {
          let object = {
            ...createCanvasObject(request.objectType, {
              id: createObjectId(),
              center: request.center,
            }),
            text: request.text?.trim() ?? "",
          } as CanvasObject;
          if (request.size) object = resizeCanvasObject(object, request.size);
          applyCommand({ type: "object/add", object });
          return {
            ok: true,
            apiVersion: AUTOMATION_API_VERSION,
            operation: "canvas.object.add",
            object,
          };
        } catch {
          return {
            ok: false,
            apiVersion: AUTOMATION_API_VERSION,
            error: {
              code: "internal_error",
              message: "Could not add the canvas object",
            },
          };
        }
      }

      if (isCanvasObjectResizeRequest(request)) {
        try {
          const object = getDocument().objects[request.objectId];
          if (!object || !objectSupportsSize(object.type, request.size)) {
            return invalidRequest();
          }

          const resized = resizeCanvasObject(object, request.size);
          applyCommand({ type: "object/update", object: resized });
          return {
            ok: true,
            apiVersion: AUTOMATION_API_VERSION,
            operation: "canvas.object.resize",
            object: resized,
          };
        } catch {
          return {
            ok: false,
            apiVersion: AUTOMATION_API_VERSION,
            error: {
              code: "internal_error",
              message: "Could not resize the canvas object",
            },
          };
        }
      }

      if (isCanvasConnectionAddRequest(request)) {
        try {
          const document = getDocument();
          if (
            !document.objects[request.from.objectId] ||
            !document.objects[request.to.objectId]
          ) {
            return invalidRequest();
          }

          const connection = {
            id: createObjectId(),
            from: request.from,
            to: request.to,
          };
          applyCommand({ type: "connection/add", connection });
          return {
            ok: true,
            apiVersion: AUTOMATION_API_VERSION,
            operation: "canvas.connection.add",
            connection,
          };
        } catch {
          return {
            ok: false,
            apiVersion: AUTOMATION_API_VERSION,
            error: {
              code: "internal_error",
              message: "Could not add the canvas connection",
            },
          };
        }
      }

      return invalidRequest();
    },
  };
}
