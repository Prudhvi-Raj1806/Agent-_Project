import type { QuickAction } from "./types";

export const mockWorkTopActions: QuickAction[] = [
  { id: "open-vscode", label: "Open VS Code", icon: "Code2" },
  { id: "start-deep-work", label: "Start Deep Work", icon: "Target" },
  { id: "take-notes", label: "Take Notes", icon: "NotebookPen" },
  { id: "start-research", label: "Start Research", icon: "Search" },
];

export const mockWorkMoreActions: QuickAction[] = [
  { id: "take-screenshot", label: "Take a Screenshot", icon: "Camera" },
  { id: "summarize-clipboard", label: "Summarize Clipboard", icon: "ClipboardList" },
];
