import type { CanvasDocument } from "../model/document";
import { applyDocumentCommand, type DocumentCommand } from "./commands";

const MAX_HISTORY_ENTRIES = 100;

type ActiveHistoryGroup = {
  key: string;
  before: CanvasDocument;
  futureBefore: CanvasDocument[];
};

export type DocumentHistory = {
  past: CanvasDocument[];
  present: CanvasDocument;
  future: CanvasDocument[];
  activeGroup: ActiveHistoryGroup | null;
};

export type HistoryAction =
  | {
      type: "history/apply";
      command: DocumentCommand;
      occurredAt: string;
      groupKey?: string;
    }
  | { type: "history/end-group"; groupKey: string }
  | { type: "history/cancel-group"; groupKey: string; occurredAt: string }
  | { type: "history/undo"; occurredAt: string }
  | { type: "history/redo"; occurredAt: string }
  | { type: "history/replace"; document: CanvasDocument };

export function createDocumentHistory(
  document: CanvasDocument,
): DocumentHistory {
  return {
    past: [],
    present: document,
    future: [],
    activeGroup: null,
  };
}

function pushPast(
  past: CanvasDocument[],
  document: CanvasDocument,
): CanvasDocument[] {
  return [...past, document].slice(-MAX_HISTORY_ENTRIES);
}

function restoredFrom(
  snapshot: CanvasDocument,
  current: CanvasDocument,
  occurredAt: string,
): CanvasDocument {
  return {
    ...snapshot,
    revision: current.revision + 1,
    updatedAt: occurredAt,
  };
}

export function documentHistoryReducer(
  state: DocumentHistory,
  action: HistoryAction,
): DocumentHistory {
  switch (action.type) {
    case "history/apply": {
      const present = applyDocumentCommand(
        state.present,
        action.command,
        action.occurredAt,
      );
      if (present === state.present) return state;

      if (action.groupKey && state.activeGroup?.key === action.groupKey) {
        return { ...state, present, future: [] };
      }

      return {
        past: pushPast(state.past, state.present),
        present,
        future: [],
        activeGroup: action.groupKey
          ? {
              key: action.groupKey,
              before: state.present,
              futureBefore: state.future,
            }
          : null,
      };
    }

    case "history/end-group":
      return state.activeGroup?.key === action.groupKey
        ? { ...state, activeGroup: null }
        : state;

    case "history/cancel-group": {
      if (state.activeGroup?.key !== action.groupKey) return state;

      return {
        past: state.past.slice(0, -1),
        present: restoredFrom(
          state.activeGroup.before,
          state.present,
          action.occurredAt,
        ),
        future: state.activeGroup.futureBefore,
        activeGroup: null,
      };
    }

    case "history/undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;

      return {
        past: state.past.slice(0, -1),
        present: restoredFrom(previous, state.present, action.occurredAt),
        future: [state.present, ...state.future],
        activeGroup: null,
      };
    }

    case "history/redo": {
      const next = state.future[0];
      if (!next) return state;

      return {
        past: pushPast(state.past, state.present),
        present: restoredFrom(next, state.present, action.occurredAt),
        future: state.future.slice(1),
        activeGroup: null,
      };
    }

    case "history/replace":
      return createDocumentHistory(action.document);
  }
}
