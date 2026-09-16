import { listRecentFiles } from "./service";
import { formatRelativeTime } from "@/lib/format";
import type { RecentFile as UiRecentFile } from "@/lib/data/types";

export async function getUiRecentFiles(limit = 8): Promise<UiRecentFile[]> {
  const files = await listRecentFiles(limit);
  return files.map((file) => ({
    id: file.path,
    name: file.name,
    path: file.path,
    kind: file.kind,
    updatedAgo: formatRelativeTime(new Date(file.mtimeMs).toISOString()),
  }));
}
