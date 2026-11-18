import { NextResponse } from "next/server";
import { normKey } from "@/lib/normalize";
import { requireAuth } from "@/lib/supabase-server";
import { loadUserBankSourceMap } from "@/lib/user-words";

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

    const allNotes = rawNotes ?? [];
    const translationNote = allNotes.find((n) => n.target_text === "__PASSAGE_TRANSLATION__");
    const notes = allNotes.filter((n) => n.target_text !== "__PASSAGE_TRANSLATION__");

    // Đối chiếu các ghi chú từ vựng với Kho cá nhân (user_words) của riêng người dùng hiện tại
    const vocabKeys = notes
      .filter((n) => n.kind === "vocab")
      .map((n) => {
        const rj = (n.result_json ?? {}) as Record<string, unknown>;
        return typeof rj.norm_key === "string" ? rj.norm_key : normKey(n.target_text);
      })
      .filter(Boolean);

    const bankMap = await loadUserBankSourceMap(db, ctx.user.id, vocabKeys);

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

    return NextResponse.json({
      passage,
      notes: enrichedNotes,
      passageTranslation: translationNote?.result_json ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
