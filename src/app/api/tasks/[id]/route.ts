import { NextResponse, type NextRequest } from "next/server";
import { TaskNotFoundError, updateTaskFields } from "@/server/tasks/service";
import type { UpdateTaskInput } from "@/server/tasks/types";

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const task = updateTaskFields(id, body as UpdateTaskInput);
    return NextResponse.json({ task });
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Internal error updating task." }, { status: 500 });
  }
}
