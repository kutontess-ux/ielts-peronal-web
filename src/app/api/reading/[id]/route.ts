import { NextResponse } from "next/server";
import { normKey } from "@/lib/normalize";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.errorResponse) return auth.errorResponse;
    const { ctx } = auth;
    const db = ctx.db;

    const { id } = await context.params;
    const passageId = Number(id);
    if (!Number.isFinite(passageId) || passageId <= 0) {
      return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
    }

    const { data: passage, error } = await db
      .from("reading_passages")
      .select("*")
      .eq("id", passageId)
      .eq("user_id", ctx.user.id)
      .single();

    if (error || !passage) {
      return NextResponse.json({ error: "Không tìm thấy bài đọc" }, { status: 404 });
    }

    const { data: rawNotes } = await db
      .from("reading_notes")
      .select("*")
      .eq("passage_id", passageId)
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false });

    const notes = rawNotes ?? [];

    // Đối chiếu trực tiếp các ghi chú từ vựng với bảng words để biết từ nào đã có trong Kho
    const vocabKeys = notes
      .filter((n) => n.kind === "vocab")
      .map((n) => {
        const rj = (n.result_json ?? {}) as Record<string, unknown>;
        return typeof rj.norm_key === "string" ? rj.norm_key : normKey(n.target_text);
      })
      .filter(Boolean);

    const bankMap = new Map<string, string>();
    if (vocabKeys.length > 0) {
      const { data: bankRows } = await db
        .from("words")
        .select("norm_key,source")
        .in("norm_key", vocabKeys);
      for (const w of bankRows ?? []) {
        bankMap.set(w.norm_key, w.source ?? "import");
      }
    }

    const enrichedNotes = notes.map((n) => {
      if (n.kind !== "vocab") return n;
      const rj = (n.result_json ?? {}) as Record<string, unknown>;
      const nk = typeof rj.norm_key === "string" ? rj.norm_key : normKey(n.target_text);
      const bankSource = bankMap.get(nk) ?? null;
      return {
        ...n,
        result_json: {
          ...rj,
          norm_key: nk,
          existsInBank: !!bankSource,
          bankSource,
        },
      };
    });

    return NextResponse.json({ passage, notes: enrichedNotes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
