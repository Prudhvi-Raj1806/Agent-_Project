import type { QuickAction } from "./types";

// Top pill row, right under the greeting — the four highest-frequency actions.
// Ids match either src/server/actions/registry.ts (real OS actions) or the
// client-only navigation handlers in src/lib/actions/use-run-action.ts.
export const mockTopActions: QuickAction[] = [
  { id: "open-vscode", label: "Open VS Code", icon: "Code2" },
  { id: "take-notes", label: "Take Notes", icon: "NotebookPen" },
  { id: "start-work-mode", label: "Start Work Mode", icon: "Layers" },
  { id: "open-browser", label: "Open Browser", icon: "Globe" },
];

// Overflow actions surfaced from the top row's "More" menu.
export const mockMoreTopActions: QuickAction[] = [
  { id: "take-screenshot", label: "Take a Screenshot", icon: "Camera" },
  { id: "summarize-clipboard", label: "Summarize Clipboard", icon: "ClipboardList" },
];

// Quick Actions panel in the grid — the broader set.
export const mockPanelActions: QuickAction[] = [
  { id: "open-vscode", label: "Open VS Code", icon: "Code2" },
  { id: "take-notes", label: "Take Notes", icon: "NotebookPen" },
  { id: "take-screenshot", label: "Take a Screenshot", icon: "Camera" },
  { id: "open-obsidian", label: "Open Obsidian", icon: "BookOpen" },
  { id: "summarize-clipboard", label: "Summarize Clipboard", icon: "ClipboardList" },
  { id: "control-computer", label: "Control Computer", icon: "MonitorCog" },
];
