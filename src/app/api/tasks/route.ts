import { NextResponse, type NextRequest } from "next/server";
import { createTask, listAllTasks } from "@/server/tasks/service";
import type { CreateTaskInput } from "@/server/tasks/types";

export async function GET() {
  const tasks = listAllTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = body as CreateTaskInput;
  if (!input || typeof input.title !== "string" || !input.title.trim()) {
    return NextResponse.json({ error: "`title` is required and must be a non-empty string." }, { status: 400 });
  }

  const task = createTask(input);
  return NextResponse.json({ task }, { status: 201 });
}
