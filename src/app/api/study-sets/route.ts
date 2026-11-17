import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

type FolderRow = {
  id: string;
  name: string;
  desc_text: string;
  created_at: string;
};

type SetRow = {
  id: string;
  title: string;
  desc_text: string;
  word_ids: number[];
  folder_id: string | null;
  created_at: string;
};

function mapFolder(r: FolderRow) {
  return {
    id: r.id,
    name: r.name,
    desc: r.desc_text ?? "",
    createdAt: r.created_at,
  };
}

function mapSet(r: SetRow) {
  return {
    id: r.id,
    title: r.title,
    desc: r.desc_text ?? "",
    wordIds: (r.word_ids ?? []).map(Number),
    folderId: r.folder_id ?? null,
    createdAt: r.created_at,
  };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;

    const [foldersRes, setsRes] = await Promise.all([
      ctx.db
        .from("study_folders")
        .select("id,name,desc_text,created_at")
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false }),
      ctx.db
        .from("study_sets")
        .select("id,title,desc_text,word_ids,folder_id,created_at")
        .eq("user_id", ctx.user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (foldersRes.error) throw new Error(foldersRes.error.message);
    if (setsRes.error) throw new Error(setsRes.error.message);

    return NextResponse.json({
      folders: (foldersRes.data as FolderRow[] ?? []).map(mapFolder),
      sets: (setsRes.data as SetRow[] ?? []).map(mapSet),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const userId = ctx.user.id;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "sync_local") {
      const folders = Array.isArray(body.folders) ? body.folders : [];
      const sets = Array.isArray(body.sets) ? body.sets : [];

      if (folders.length > 0) {
        const folderRows = folders.map((f: Record<string, unknown>) => ({
          id: `${userId.slice(0, 8)}_${String(f.id)}`,
          user_id: userId,
          name: String(f.name ?? "").trim(),
          desc_text: String(f.desc ?? "").trim(),
          created_at: String(f.createdAt ?? new Date().toISOString()),
        }));
        const { error } = await ctx.db
          .from("study_folders")
          .upsert(folderRows, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }

      if (sets.length > 0) {
        const setRows = sets.map((s: Record<string, unknown>) => ({
          id: `${userId.slice(0, 8)}_${String(s.id)}`,
          user_id: userId,
          title: String(s.title ?? "").trim(),
          desc_text: String(s.desc ?? "").trim(),
          word_ids: Array.isArray(s.wordIds) ? s.wordIds.map(Number) : [],
          folder_id: s.folderId ? `${userId.slice(0, 8)}_${String(s.folderId)}` : null,
          created_at: String(s.createdAt ?? new Date().toISOString()),
        }));
        const { error } = await ctx.db
          .from("study_sets")
          .upsert(setRows, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "create_set") {
      const s = body.set as Record<string, unknown>;
      const { error } = await ctx.db.from("study_sets").upsert(
        {
          id: String(s.id),
          user_id: userId,
          title: String(s.title ?? "").trim(),
          desc_text: String(s.desc ?? "").trim(),
          word_ids: Array.isArray(s.wordIds) ? s.wordIds.map(Number) : [],
          folder_id: s.folderId ? String(s.folderId) : null,
          created_at: String(s.createdAt ?? new Date().toISOString()),
        },
        { onConflict: "id" }
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "update_set") {
      const id = String(body.id ?? "");
      const patch = body.patch as Record<string, unknown>;
      const updateObj: Record<string, unknown> = {
        title: String(patch.title ?? "").trim(),
        desc_text: String(patch.desc ?? "").trim(),
        word_ids: Array.isArray(patch.wordIds) ? patch.wordIds.map(Number) : [],
      };
      if (patch.folderId !== undefined) {
        updateObj.folder_id = patch.folderId ? String(patch.folderId) : null;
      }
      const { error } = await ctx.db
        .from("study_sets")
        .update(updateObj)
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "move_set") {
      const setId = String(body.setId ?? "");
      const folderId = body.folderId ? String(body.folderId) : null;
      const { error } = await ctx.db
        .from("study_sets")
        .update({ folder_id: folderId })
        .eq("id", setId)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_folder_sets") {
      const folderId = String(body.folderId ?? "");
      const setIds = Array.isArray(body.setIds) ? body.setIds.map(String) : [];

      const { error: clearErr } = await ctx.db
        .from("study_sets")
        .update({ folder_id: null })
        .eq("folder_id", folderId)
        .eq("user_id", userId);
      if (clearErr) throw new Error(clearErr.message);

      if (setIds.length > 0) {
        const { error: setErr } = await ctx.db
          .from("study_sets")
          .update({ folder_id: folderId })
          .in("id", setIds)
          .eq("user_id", userId);
        if (setErr) throw new Error(setErr.message);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_set") {
      const id = String(body.id ?? "");
      const { error } = await ctx.db
        .from("study_sets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "create_folder") {
      const f = body.folder as Record<string, unknown>;
      const { error } = await ctx.db.from("study_folders").upsert(
        {
          id: String(f.id),
          user_id: userId,
          name: String(f.name ?? "").trim(),
          desc_text: String(f.desc ?? "").trim(),
          created_at: String(f.createdAt ?? new Date().toISOString()),
        },
        { onConflict: "id" }
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "update_folder") {
      const id = String(body.id ?? "");
      const patch = body.patch as Record<string, unknown>;
      const { error } = await ctx.db
        .from("study_folders")
        .update({
          name: String(patch.name ?? "").trim(),
          desc_text: String(patch.desc ?? "").trim(),
        })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_folder") {
      const id = String(body.id ?? "");
      const { error } = await ctx.db
        .from("study_folders")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
