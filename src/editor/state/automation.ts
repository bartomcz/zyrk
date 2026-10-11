import type { CanvasDocument } from "../model/document";
import { parseCanvasDocumentValue } from "../model/schema";

export const AUTOMATION_API_VERSION = 1 as const;

export type AutomationRequest = {
  apiVersion: typeof AUTOMATION_API_VERSION;
  operation: "canvas.get";
};

export type AutomationResponse =
  | {
      ok: true;
      apiVersion: typeof AUTOMATION_API_VERSION;
      operation: "canvas.get";
      document: CanvasDocument;
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

function isCanvasGetRequest(value: unknown): value is AutomationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const request = value as Record<string, unknown>;
  return (
    request.apiVersion === AUTOMATION_API_VERSION &&
    request.operation === "canvas.get" &&
    Object.keys(request).every(
      (key) => key === "apiVersion" || key === "operation",
    )
  );
}

export function createAutomationService(
  getDocument: () => CanvasDocument,
): AutomationService {
  return {
    execute(request) {
      if (!isCanvasGetRequest(request)) {
        return {
          ok: false,
          apiVersion: AUTOMATION_API_VERSION,
          error: {
            code: "invalid_request",
            message: "Expected a version 1 canvas.get request",
          },
        };
      }

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
    },
  };
}
