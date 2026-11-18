"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Repeat,
  RotateCcw,
  Settings2,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import { levelColor, type Word } from "@/lib/mock";
import { notifyDueUpdated } from "@/lib/due-events";
import { speakWord as speakTts } from "@/lib/tts";
import { VoiceSettingsButton } from "@/components/VoiceSettingsModal";
import {
  checkRecallSoftMatch,
  checkVietnameseMeaningMatch,
  enrollWordsInSrs,
} from "@/lib/srs";
import {
  recordStudySetSession,
  type StudySetReviewResult,
} from "@/lib/study-sets";

export type TestCompletionPayload = {
  knownCount: number;
  unknownCount: number;
  totalCount: number;
  scorePct: number;
};

type AnswerWith = "both" | "term" | "meaning";
type AnswerSide = "term" | "meaning";

type TestConfig = {
  questionCount: number;
  answerWith: AnswerWith;
  trueFalse: boolean;
  multipleChoice: boolean;
  matching: boolean;
  written: boolean;
};

type TrueFalseQuestion = {
  id: string;
  kind: "trueFalse";
  word: Word;
  answerSide: AnswerSide;
  promptLabel: string;
  promptText: string;
  proposedLabel: string;
  proposedText: string;
  isStatementTrue: boolean;
  correctAnswerText: string;
};

type MultipleChoiceOption = {
  id: string;
  label: string;
  sub?: string;
  isCorrect: boolean;
};

type MultipleChoiceQuestion = {
  id: string;
  kind: "multipleChoice";
  word: Word;
  answerSide: AnswerSide;
  promptLabel: string;
  promptText: string;
  options: MultipleChoiceOption[];
  correctAnswerText: string;
};

type WrittenQuestion = {
  id: string;
  kind: "written";
  word: Word;
  answerSide: AnswerSide;
  promptLabel: string;
  promptText: string;
  correctAnswerText: string;
};

type MatchingPair = {
  pairId: string;
  word: Word;
  promptText: string;
  answerText: string;
};

type MatchingBlock = {
  id: string;
  kind: "matching";
  answerSide: AnswerSide;
  pairs: MatchingPair[];
  shuffledAnswers: { pairId: string; text: string }[];
};

type TestSection =
  | TrueFalseQuestion
  | MultipleChoiceQuestion
  | WrittenQuestion
  | MatchingBlock;

type GradedItem = {
  id: string;
  kind: "trueFalse" | "multipleChoice" | "matching" | "written";
  word: Word;
  promptText: string;
  userAnswerText: string;
  correctAnswerText: string;
  isCorrect: boolean;
  overridden?: boolean;
};

const TEST_CFG_KEY = "ielts_studyset_test_cfg_v1";

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDistractorWords(
  card: Word,
  setWords: Word[],
  wordPool: Word[],
  count: number
): Word[] {
  const candidates = new Map<number, Word>();
  for (const w of setWords) {
    if (w.id !== card.id) candidates.set(w.id, w);
  }
  for (const w of wordPool) {
    if (w.id !== card.id && !candidates.has(w.id)) candidates.set(w.id, w);
  }
  const all = Array.from(candidates.values()).filter(
    (w) => Boolean(w.word) && Boolean(w.vi || w.en)
  );
  const scored = all.sort((a, b) => {
    const sa = (a.pos === card.pos ? 2 : 0) + (a.level === card.level ? 1 : 0);
    const sb = (b.pos === card.pos ? 2 : 0) + (b.level === card.level ? 1 : 0);
    if (sb !== sa) return sb - sa;
    return Math.random() - 0.5;
  });
  return scored.slice(0, count);
}

function resolveAnswerSide(answerWith: AnswerWith, idx: number): AnswerSide {
  if (answerWith === "term") return "term";
  if (answerWith === "meaning") return "meaning";
  return idx % 2 === 0 ? "meaning" : "term";
}

function buildTestSections(
  words: Word[],
  wordPool: Word[],
  cfg: TestConfig
): { sections: TestSection[]; totalQuestionCount: number } {
  if (words.length === 0) return { sections: [], totalQuestionCount: 0 };

  const targetCount = Math.max(1, Math.min(words.length, cfg.questionCount));
  const enabled: Array<"trueFalse" | "multipleChoice" | "matching" | "written"> = [];
  if (cfg.trueFalse) enabled.push("trueFalse");
  if (cfg.multipleChoice) enabled.push("multipleChoice");
  if (cfg.matching && words.length >= 2) enabled.push("matching");
  if (cfg.written) enabled.push("written");
  if (enabled.length === 0) enabled.push("multipleChoice");

  // Phân bổ số lượng câu cho từng dạng đang bật
  const counts: Record<"trueFalse" | "multipleChoice" | "matching" | "written", number> = {
    trueFalse: 0,
    multipleChoice: 0,
    matching: 0,
    written: 0,
  };
  const base = Math.floor(targetCount / enabled.length);
  let rem = targetCount % enabled.length;
  for (const k of enabled) {
    counts[k] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
  }

  // Ghép thẻ cần tối thiểu 2 cặp mới có nghĩa
  if (counts.matching === 1) {
    const donor = enabled.find((k) => k !== "matching" && counts[k] >= 2);
    if (donor) {
      counts.matching += 1;
      counts[donor] -= 1;
    } else {
      counts.matching = 0;
      const fallback = enabled.find((k) => k !== "matching") ?? "multipleChoice";
      counts[fallback] += 1;
    }
  }

  const pool = shuffleArray(words).slice(0, targetCount);
  let cursor = 0;
  const takeWords = (n: number): Word[] => {
    const out: Word[] = [];
    for (let i = 0; i < n; i++) {
      out.push(pool[cursor % pool.length]);
      cursor++;
    }
    return out;
  };

  const sections: TestSection[] = [];
  let qSeed = 0;

  // 1. Đúng / Sai
  const tfWords = takeWords(counts.trueFalse);
  for (const w of tfWords) {
    const answerSide = resolveAnswerSide(cfg.answerWith, qSeed++);
    const distractors = getDistractorWords(w, words, wordPool, 1);
    const makeTrue = distractors.length === 0 || Math.random() < 0.5;
    const shownWord = makeTrue ? w : distractors[0];

    const meaningText = w.vi || w.en;
    const shownMeaningText = shownWord.vi || shownWord.en;

    if (answerSide === "meaning") {
      sections.push({
        id: `tf-${w.id}-${qSeed}`,
        kind: "trueFalse",
        word: w,
        answerSide,
        promptLabel: "Thuật ngữ",
        promptText: w.word,
        proposedLabel: "Định nghĩa",
        proposedText: shownMeaningText,
        isStatementTrue: makeTrue,
        correctAnswerText: makeTrue ? "Đúng" : `Sai (Đáp án: ${meaningText})`,
      });
    } else {
      sections.push({
        id: `tf-${w.id}-${qSeed}`,
        kind: "trueFalse",
        word: w,
        answerSide,
        promptLabel: "Định nghĩa",
        promptText: meaningText,
        proposedLabel: "Thuật ngữ",
        proposedText: shownWord.word,
        isStatementTrue: makeTrue,
        correctAnswerText: makeTrue ? "Đúng" : `Sai (Đáp án: ${w.word})`,
      });
    }
  }

  // 2. Trắc nghiệm
  const mcWords = takeWords(counts.multipleChoice);
  for (const w of mcWords) {
    const answerSide = resolveAnswerSide(cfg.answerWith, qSeed++);
    const distractors = getDistractorWords(w, words, wordPool, 3);
    const correctLabel = answerSide === "term" ? w.word : w.vi || w.en;
    const options: MultipleChoiceOption[] = shuffleArray([
      {
        id: `opt-${w.id}`,
        label: correctLabel,
        sub: answerSide === "term" ? w.pos || undefined : undefined,
        isCorrect: true,
      },
      ...distractors.map((d) => ({
        id: `opt-${d.id}`,
        label: answerSide === "term" ? d.word : d.vi || d.en,
        sub: answerSide === "term" ? d.pos || undefined : undefined,
        isCorrect: false,
      })),
    ]);

    sections.push({
      id: `mc-${w.id}-${qSeed}`,
      kind: "multipleChoice",
      word: w,
      answerSide,
      promptLabel: answerSide === "term" ? "Định nghĩa" : "Thuật ngữ",
      promptText: answerSide === "term" ? w.vi || w.en : w.word,
      options,
      correctAnswerText: correctLabel,
    });
  }

  // 3. Ghép thẻ (chia thành các block tối đa 5 cặp)
  const matchWords = takeWords(counts.matching);
  for (let i = 0; i < matchWords.length; i += 5) {
    const chunk = matchWords.slice(i, i + 5);
    if (chunk.length < 2) continue;
    const answerSide: AnswerSide =
      cfg.answerWith === "term" ? "term" : "meaning";
    const pairs: MatchingPair[] = chunk.map((w, idx) => ({
      pairId: `mp-${qSeed}-${i}-${idx}-${w.id}`,
      word: w,
      promptText: answerSide === "term" ? w.vi || w.en : w.word,
      answerText: answerSide === "term" ? w.word : w.vi || w.en,
    }));
    const shuffledAnswers = shuffleArray(
      pairs.map((p) => ({ pairId: p.pairId, text: p.answerText }))
    );
    sections.push({
      id: `match-block-${qSeed}-${i}`,
      kind: "matching",
      answerSide,
      pairs,
      shuffledAnswers,
    });
  }

  // 4. Tự luận
  const wrWords = takeWords(counts.written);
  for (const w of wrWords) {
    const answerSide = resolveAnswerSide(cfg.answerWith, qSeed++);
    const correctAnswerText = answerSide === "term" ? w.word : w.vi || w.en;
    sections.push({
      id: `wr-${w.id}-${qSeed}`,
      kind: "written",
      word: w,
      answerSide,
      promptLabel: answerSide === "term" ? "Định nghĩa" : "Thuật ngữ",
      promptText: answerSide === "term" ? w.vi || w.en : w.word,
      correctAnswerText,
    });
  }

  return { sections, totalQuestionCount: targetCount };
}

function loadSavedTestConfig(maxQuestions: number): TestConfig {
  const defaultCount = Math.min(20, Math.max(1, maxQuestions));
  const fallback: TestConfig = {
    questionCount: defaultCount,
    answerWith: "both",
    trueFalse: true,
    multipleChoice: true,
    matching: maxQuestions >= 2,
    written: true,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(TEST_CFG_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TestConfig>;
    const next: TestConfig = {
      questionCount: Math.max(
        1,
        Math.min(maxQuestions, Number(parsed.questionCount) || defaultCount)
      ),
      answerWith:
        parsed.answerWith === "term" || parsed.answerWith === "meaning"
          ? parsed.answerWith
          : "both",
      trueFalse: parsed.trueFalse ?? true,
      multipleChoice: parsed.multipleChoice ?? true,
      matching: maxQuestions >= 2 ? (parsed.matching ?? true) : false,
      written: parsed.written ?? true,
    };
    if (!next.trueFalse && !next.multipleChoice && !next.matching && !next.written) {
      next.multipleChoice = true;
    }
    return next;
  } catch {
    return fallback;
  }
}

export default function StudySetTest({
  setId,
  title,
  words,
  wordPool,
  isAdmin = false,
  onBack,
  onCompleted,
}: {
  setId: string;
  title: string;
  words: Word[];
  wordPool: Word[];
  isAdmin?: boolean;
  onBack: () => void;
  onCompleted?: (result: TestCompletionPayload) => StudySetReviewResult | null | void;
}) {
  const [config, setConfig] = useState<TestConfig>(() =>
    loadSavedTestConfig(words.length)
  );
  const [setupOpen, setSetupOpen] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);

  const [testWords, setTestWords] = useState<Word[]>(words);
  const [sections, setSections] = useState<TestSection[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);

  // State câu trả lời
  const [tfAnswers, setTfAnswers] = useState<Record<string, boolean | null>>({});
  const [mcAnswers, setMcAnswers] = useState<Record<string, string>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  // matchAnswers: blockId -> { [leftPairId]: rightPairId }
  const [matchAnswers, setMatchAnswers] = useState<
    Record<string, Record<string, string>>
  >({});
  const [activeMatchLeft, setActiveMatchLeft] = useState<{
    blockId: string;
    pairId: string;
  } | null>(null);

  // Kết quả sau khi nộp
  const [gradedItems, setGradedItems] = useState<GradedItem[] | null>(null);
  const [reviewSchedule, setReviewSchedule] = useState<StudySetReviewResult | null>(
    null
  );
  const [srsMsg, setSrsMsg] = useState("");
  const submittedRef = useRef(false);

  const startTest = useCallback(
    (sourceWords: Word[], cfg: TestConfig) => {
      const clampedCfg: TestConfig = {
        ...cfg,
        questionCount: Math.max(
          1,
          Math.min(sourceWords.length, cfg.questionCount || 1)
        ),
        matching: sourceWords.length >= 2 ? cfg.matching : false,
      };
      if (
        !clampedCfg.trueFalse &&
        !clampedCfg.multipleChoice &&
        !clampedCfg.matching &&
        !clampedCfg.written
      ) {
        clampedCfg.multipleChoice = true;
      }

      try {
        localStorage.setItem(TEST_CFG_KEY, JSON.stringify(clampedCfg));
      } catch {
        // bỏ qua
      }

      const built = buildTestSections(sourceWords, wordPool, clampedCfg);
      submittedRef.current = false;
      setTestWords(sourceWords);
      setConfig(clampedCfg);
      setSections(built.sections);
      setTotalQuestions(built.totalQuestionCount);
      setTfAnswers({});
      setMcAnswers({});
      setWrittenAnswers({});
      setMatchAnswers({});
      setActiveMatchLeft(null);
      setGradedItems(null);
      setReviewSchedule(null);
      setSrsMsg("");
      setHasStarted(true);
      setSetupOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [wordPool]
  );

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const sec of sections) {
      if (sec.kind === "trueFalse") {
        if (tfAnswers[sec.id] !== undefined && tfAnswers[sec.id] !== null) count++;
      } else if (sec.kind === "multipleChoice") {
        if (mcAnswers[sec.id]) count++;
      } else if (sec.kind === "written") {
        if ((writtenAnswers[sec.id] ?? "").trim().length > 0) count++;
      } else if (sec.kind === "matching") {
        const blockMap = matchAnswers[sec.id] ?? {};
        for (const p of sec.pairs) {
          if (blockMap[p.pairId]) count++;
        }
      }
    }
    return count;
  }, [sections, tfAnswers, mcAnswers, writtenAnswers, matchAnswers]);

  const handleMatchPairClick = (
    blockId: string,
    side: "left" | "right",
    pairId: string
  ) => {
    if (gradedItems) return;

    if (side === "left") {
      // Nếu ô trái đã ghép rồi -> bấm để huỷ ghép
      const currentMap = matchAnswers[blockId] ?? {};
      if (currentMap[pairId]) {
        const next = { ...currentMap };
        delete next[pairId];
        setMatchAnswers((prev) => ({ ...prev, [blockId]: next }));
        setActiveMatchLeft({ blockId, pairId });
        return;
      }
      if (
        activeMatchLeft?.blockId === blockId &&
        activeMatchLeft.pairId === pairId
      ) {
        setActiveMatchLeft(null);
      } else {
        setActiveMatchLeft({ blockId, pairId });
      }
      return;
    }

    // side === "right"
    if (activeMatchLeft && activeMatchLeft.blockId === blockId) {
      const leftId = activeMatchLeft.pairId;
      setMatchAnswers((prev) => {
        const currentMap = { ...(prev[blockId] ?? {}) };
        // Gỡ nếu right pairId đang được ghép với ô trái khác
        for (const [k, v] of Object.entries(currentMap)) {
          if (v === pairId) delete currentMap[k];
        }
        currentMap[leftId] = pairId;
        return { ...prev, [blockId]: currentMap };
      });
      setActiveMatchLeft(null);
    } else {
      // Nếu bấm ô phải đã ghép mà chưa chọn ô trái -> gỡ ghép của ô phải đó
      setMatchAnswers((prev) => {
        const currentMap = { ...(prev[blockId] ?? {}) };
        let changed = false;
        for (const [k, v] of Object.entries(currentMap)) {
          if (v === pairId) {
            delete currentMap[k];
            changed = true;
          }
        }
        return changed ? { ...prev, [blockId]: currentMap } : prev;
      });
    }
  };

  const handleSubmitTest = () => {
    if (submittedRef.current || sections.length === 0) return;
    submittedRef.current = true;

    const results: GradedItem[] = [];

    for (const sec of sections) {
      if (sec.kind === "trueFalse") {
        const chosen = tfAnswers[sec.id];
        const isCorrect =
          chosen !== undefined &&
          chosen !== null &&
          chosen === sec.isStatementTrue;
        results.push({
          id: sec.id,
          kind: "trueFalse",
          word: sec.word,
          promptText: `${sec.promptText} → ${sec.proposedText}`,
          userAnswerText:
            chosen === true ? "Đúng" : chosen === false ? "Sai" : "(Chưa chọn)",
          correctAnswerText: sec.correctAnswerText,
          isCorrect,
        });
      } else if (sec.kind === "multipleChoice") {
        const chosenId = mcAnswers[sec.id];
        const chosenOpt = sec.options.find((o) => o.id === chosenId);
        const isCorrect = Boolean(chosenOpt?.isCorrect);
        results.push({
          id: sec.id,
          kind: "multipleChoice",
          word: sec.word,
          promptText: sec.promptText,
          userAnswerText: chosenOpt ? chosenOpt.label : "(Chưa chọn)",
          correctAnswerText: sec.correctAnswerText,
          isCorrect,
        });
      } else if (sec.kind === "matching") {
        const blockMap = matchAnswers[sec.id] ?? {};
        for (const p of sec.pairs) {
          const chosenRightId = blockMap[p.pairId];
          const chosenPair = sec.pairs.find((x) => x.pairId === chosenRightId);
          const isCorrect = chosenRightId === p.pairId;
          results.push({
            id: p.pairId,
            kind: "matching",
            word: p.word,
            promptText: p.promptText,
            userAnswerText: chosenPair ? chosenPair.answerText : "(Chưa ghép)",
            correctAnswerText: p.answerText,
            isCorrect,
          });
        }
      } else if (sec.kind === "written") {
        const raw = (writtenAnswers[sec.id] ?? "").trim();
        let isCorrect = false;
        if (raw) {
          if (sec.answerSide === "term") {
            const match = checkRecallSoftMatch(
              raw,
              sec.word.word,
              sec.word.synonyms ?? []
            );
            isCorrect = match === "exact" || match === "synonym";
          } else {
            isCorrect = checkVietnameseMeaningMatch(
              raw,
              sec.word.vi,
              sec.word.en
            ).isCorrect;
          }
        }
        results.push({
          id: sec.id,
          kind: "written",
          word: sec.word,
          promptText: sec.promptText,
          userAnswerText: raw || "(Bỏ trống)",
          correctAnswerText: sec.correctAnswerText,
          isCorrect,
        });
      }
    }

    const totalCount = results.length;
    const knownCount = results.filter((r) => r.isCorrect).length;
    const unknownCount = totalCount - knownCount;
    const scorePct = totalCount ? Math.round((knownCount / totalCount) * 100) : 100;

    setGradedItems(results);

    // Ghi nhận phiên học & cập nhật lịch ôn học phần + thêm từ mới vào SRS
    recordStudySetSession({ setId, title, wordCount: testWords.length });
    const scheduleRes = onCompleted?.({
      knownCount,
      unknownCount,
      totalCount,
      scorePct,
    });
    if (scheduleRes) {
      setReviewSchedule(scheduleRes);
    }

    void enrollWordsInSrs(testWords.map((w) => w.id))
      .then((res) => {
        notifyDueUpdated();
        setSrsMsg(
          res.enrolled > 0
            ? `Đã đồng bộ thêm ${res.enrolled} từ mới vào Ôn tập ngắt quãng`
            : "Các từ đã được đồng bộ với Ôn tập ngắt quãng"
        );
      })
      .catch(() => {
        // bỏ qua nếu chưa kết nối DB
      });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const overrideWrittenAsCorrect = (itemId: string) => {
    setGradedItems((prev) =>
      prev
        ? prev.map((it) =>
            it.id === itemId
              ? { ...it, isCorrect: true, overridden: true }
              : it
          )
        : prev
    );
  };

  const toggleType = (
    key: "trueFalse" | "multipleChoice" | "matching" | "written"
  ) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const activeCount = [
        next.trueFalse,
        next.multipleChoice,
        next.matching && words.length >= 2,
        next.written,
      ].filter(Boolean).length;
      if (activeCount === 0) return prev;
      return next;
    });
  };

  // Modal Thiết lập bài kiểm tra (kiểu Quizlet)
  const setupModal = setupOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
      onClick={() => {
        if (hasStarted) setSetupOpen(false);
        else onBack();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-muted">{title}</div>
            <h2 className="mt-0.5 text-xl font-extrabold text-ink sm:text-2xl">
              Thiết lập bài kiểm tra
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (hasStarted) setSetupOpen(false);
              else onBack();
            }}
            className="rounded-full bg-bg p-2 text-muted transition hover:text-ink"
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-ink">
              Câu hỏi{" "}
              <span className="font-normal text-muted">
                (tối đa {words.length})
              </span>
            </label>
            <input
              type="number"
              min={1}
              max={words.length}
              value={config.questionCount}
              onChange={(e) => {
                const v = Number(e.target.value);
                setConfig((prev) => ({
                  ...prev,
                  questionCount: Number.isFinite(v) ? v : 1,
                }));
              }}
              onBlur={() =>
                setConfig((prev) => ({
                  ...prev,
                  questionCount: Math.max(
                    1,
                    Math.min(words.length, Math.round(prev.questionCount) || 1)
                  ),
                }))
              }
              className="w-20 rounded-xl border border-line bg-bg px-3 py-2 text-center text-sm font-bold text-ink focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-ink">
              Trả lời bằng
            </label>
            <select
              value={config.answerWith}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  answerWith: e.target.value as AnswerWith,
                }))
              }
              className="rounded-xl border border-line bg-bg px-3 py-2 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
            >
              <option value="both">Cả hai</option>
              <option value="term">Thuật ngữ (Tiếng Anh)</option>
              <option value="meaning">Định nghĩa (Tiếng Việt)</option>
            </select>
          </div>

          <div className="my-2 border-t border-line" />

          {(
            [
              { key: "trueFalse", label: "Đúng/Sai", disabled: false },
              { key: "multipleChoice", label: "Trắc nghiệm", disabled: false },
              {
                key: "matching",
                label: "Ghép thẻ",
                disabled: words.length < 2,
                hint: words.length < 2 ? "Cần ít nhất 2 từ" : undefined,
              },
              { key: "written", label: "Tự luận", disabled: false },
            ] as const
          ).map((item) => {
            const active = !item.disabled && config[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 py-0.5"
              >
                <div>
                  <div className="text-sm font-semibold text-ink">
                    {item.label}
                  </div>
                  {"hint" in item && item.hint && (
                    <div className="text-[11px] text-muted">{item.hint}</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => toggleType(item.key)}
                  aria-pressed={active}
                  className={`relative h-6 w-11 rounded-full transition disabled:opacity-40 ${
                    active ? "bg-brand" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      active ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => startTest(words, config)}
            className="w-full rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-hover sm:w-auto"
          >
            Bắt đầu làm kiểm tra
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (!hasStarted) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        {setupModal}
      </div>
    );
  }

  // Màn hình kết quả sau khi nộp bài
  if (gradedItems) {
    const totalCount = gradedItems.length;
    const correctCount = gradedItems.filter((g) => g.isCorrect).length;
    const wrongItems = gradedItems.filter((g) => !g.isCorrect);
    const pct = totalCount ? Math.round((correctCount / totalCount) * 100) : 100;
    const wrongWords = Array.from(
      new Map(wrongItems.map((w) => [w.word.id, w.word])).values()
    );

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {setupModal}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft size={16} /> {title}
          </button>
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-bold text-ink hover:border-brand-hover"
          >
            <Settings2 size={14} /> Thiết lập
          </button>
        </div>

        {/* Tổng kết điểm */}
        <div className="rounded-3xl border border-line bg-card p-6 text-center sm:p-8">
          <ClipboardCheck
            size={48}
            strokeWidth={1.3}
            className="mx-auto text-brand-hover"
          />
          <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">
            Kết quả bài kiểm tra
          </h1>
          <p className="mt-1 text-sm text-muted">
            {title} · {totalCount} câu hỏi
          </p>

          {isAdmin && reviewSchedule && (
            <div className="mx-auto mt-4 inline-flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-brand/15 px-4 py-2 text-xs font-bold text-brand-hover">
              <CalendarClock size={15} />
              Đã hẹn tự ôn lại học phần sau {reviewSchedule.intervalDays} ngày
              (Mức {reviewSchedule.nextLevel}/5)
            </div>
          )}

          {srsMsg && (
            <div className="mx-auto mt-2.5 flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/15 px-3.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <Repeat size={13} /> {srsMsg}
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-2.5 sm:gap-4">
            <div className="rounded-2xl bg-bg p-3 sm:p-4">
              <div className="text-xl font-extrabold text-brand-hover sm:text-2xl">
                {pct}%
              </div>
              <div className="mt-1 text-xs text-muted">Điểm số</div>
            </div>
            <div className="rounded-2xl bg-emerald-500/15 p-3 sm:p-4 dark:bg-emerald-400/10">
              <div className="text-xl font-extrabold text-emerald-700 sm:text-2xl dark:text-emerald-300">
                {correctCount}
              </div>
              <div className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                Đúng
              </div>
            </div>
            <div className="rounded-2xl bg-rose-500/15 p-3 sm:p-4 dark:bg-rose-400/10">
              <div className="text-xl font-extrabold text-rose-700 sm:text-2xl dark:text-rose-300">
                {wrongItems.length}
              </div>
              <div className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
                Sai
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {wrongWords.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  startTest(wrongWords, {
                    ...config,
                    questionCount: Math.min(config.questionCount, wrongWords.length),
                  })
                }
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-hover"
              >
                <RotateCcw size={15} /> Kiểm tra lại {wrongWords.length} từ sai
              </button>
            )}
            <button
              type="button"
              onClick={() => startTest(words, config)}
              className="inline-flex items-center gap-2 rounded-full bg-line px-5 py-2.5 text-sm font-bold text-ink hover:bg-card-hover"
            >
              <RotateCcw size={15} /> Làm bài kiểm tra mới
            </button>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full bg-bg px-5 py-2.5 text-sm font-bold text-muted hover:text-ink"
            >
              <ArrowLeft size={15} /> Quay lại học phần
            </button>
          </div>
        </div>

        {/* Chi tiết từng câu */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-ink">
            Chi tiết đáp án ({gradedItems.length} câu)
          </h2>
          {gradedItems.map((item, idx) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 sm:p-5 ${
                item.isCorrect
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-rose-500/30 bg-rose-500/5"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-xs font-bold text-muted">
                  Câu {idx + 1} ·{" "}
                  {item.kind === "trueFalse"
                    ? "Đúng/Sai"
                    : item.kind === "multipleChoice"
                      ? "Trắc nghiệm"
                      : item.kind === "matching"
                        ? "Ghép thẻ"
                        : "Tự luận"}
                </div>
                <div className="flex items-center gap-2">
                  {item.isCorrect ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={13} />{" "}
                      {item.overridden ? "Đã ghi nhận đúng" : "Đúng"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                      <XCircle size={13} /> Sai
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 text-base font-bold text-ink">
                {item.promptText}
              </div>

              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 sm:text-sm">
                <div className="rounded-xl bg-card px-3 py-2">
                  <span className="text-muted">Bạn trả lời: </span>
                  <span
                    className={`font-semibold ${
                      item.isCorrect
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    {item.userAnswerText}
                  </span>
                </div>
                <div className="rounded-xl bg-card px-3 py-2">
                  <span className="text-muted">Đáp án đúng: </span>
                  <span className="font-semibold text-ink">
                    {item.correctAnswerText}
                  </span>
                </div>
              </div>

              {!item.isCorrect && item.kind === "written" && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => overrideWrittenAsCorrect(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1 text-xs font-bold text-muted transition hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-300"
                  >
                    <Check size={13} /> Ghi nhận là đúng
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Trang làm bài kiểm tra (cuộn dọc giống Quizlet)
  const sectionStarts: number[] = [];
  let accNum = 1;
  for (const sec of sections) {
    sectionStarts.push(accNum);
    accNum += sec.kind === "matching" ? sec.pairs.length : 1;
  }
  const progressPct = totalQuestions
    ? Math.round((answeredCount / totalQuestions) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      {setupModal}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft size={16} /> {title}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <VoiceSettingsButton variant="compact" />
          <button
            type="button"
            onClick={() => setSetupOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink hover:border-brand-hover"
          >
            <Settings2 size={13} /> Thiết lập
          </button>
          <span className="rounded-full bg-card px-3 py-1.5 text-xs font-bold">
            {answeredCount}/{totalQuestions} câu
          </span>
        </div>
      </div>

      {/* Thanh tiến độ */}
      <div className="h-2 overflow-hidden rounded-full bg-card">
        <div
          className="h-full bg-brand-hover transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Danh sách câu hỏi */}
      <div className="space-y-4">
        {sections.map((sec, secIdx) => {
          const startNum = sectionStarts[secIdx] ?? 1;
          if (sec.kind === "trueFalse") {
            const num = startNum;
            const chosen = tfAnswers[sec.id];
            return (
              <div
                key={sec.id}
                className="rounded-3xl border border-line bg-card p-5 sm:p-6"
              >
                <div className="flex items-center justify-between text-xs font-bold text-muted">
                  <span>Đúng / Sai</span>
                  <span>
                    {num}/{totalQuestions}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-line">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-muted">
                      {sec.promptLabel}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-ink">
                        {sec.promptText}
                      </span>
                      {sec.promptLabel === "Thuật ngữ" && (
                        <button
                          type="button"
                          onClick={() => speakTts(sec.word.word)}
                          className="rounded-full p-1 text-muted hover:bg-bg hover:text-ink"
                          aria-label="Phát âm"
                        >
                          <Volume2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:pl-4">
                    <div className="text-xs font-semibold text-muted">
                      {sec.proposedLabel}
                    </div>
                    <div className="text-lg font-semibold text-ink">
                      {sec.proposedText}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    { val: true, label: "Đúng" },
                    { val: false, label: "Sai" },
                  ].map((opt) => {
                    const active = chosen === opt.val;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() =>
                          setTfAnswers((prev) => ({ ...prev, [sec.id]: opt.val }))
                        }
                        className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                          active
                            ? "border-brand bg-brand/15 text-brand-hover"
                            : "border-line bg-bg text-ink hover:border-brand-hover"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          if (sec.kind === "multipleChoice") {
            const num = startNum;
            const chosenId = mcAnswers[sec.id];
            return (
              <div
                key={sec.id}
                className="rounded-3xl border border-line bg-card p-5 sm:p-6"
              >
                <div className="flex items-center justify-between text-xs font-bold text-muted">
                  <span>Trắc nghiệm · {sec.promptLabel}</span>
                  <span>
                    {num}/{totalQuestions}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      levelColor[sec.word.level] ?? ""
                    }`}
                  >
                    {sec.word.level}
                  </span>
                  <span className="text-xl font-bold text-ink">
                    {sec.promptText}
                  </span>
                  {sec.answerSide === "meaning" && (
                    <button
                      type="button"
                      onClick={() => speakTts(sec.word.word)}
                      className="rounded-full p-1 text-muted hover:bg-bg hover:text-ink"
                      aria-label="Phát âm"
                    >
                      <Volume2 size={15} />
                    </button>
                  )}
                </div>

                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {sec.options.map((opt, idx) => {
                    const active = chosenId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setMcAnswers((prev) => ({ ...prev, [sec.id]: opt.id }))
                        }
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                          active
                            ? "border-brand bg-brand/15 text-brand-hover"
                            : "border-line bg-bg text-ink hover:border-brand-hover"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                            active
                              ? "bg-brand text-white"
                              : "bg-card text-muted"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="min-w-0 flex-1 break-words">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          if (sec.kind === "matching") {
            const endNum = startNum + sec.pairs.length - 1;
            const blockMap = matchAnswers[sec.id] ?? {};

            // Tạo map rightPairId -> số thứ tự cặp đã ghép (1..k)
            const pairNumberMap = new Map<string, number>();
            sec.pairs.forEach((p, idx) => {
              pairNumberMap.set(p.pairId, idx + 1);
            });

            const rightToLeftNumber = new Map<string, number>();
            for (const [leftId, rightId] of Object.entries(blockMap)) {
              const n = pairNumberMap.get(leftId);
              if (n) rightToLeftNumber.set(rightId, n);
            }

            return (
              <div
                key={sec.id}
                className="rounded-3xl border border-line bg-card p-5 sm:p-6"
              >
                <div className="flex items-center justify-between text-xs font-bold text-muted">
                  <span>
                    Ghép thẻ · Chọn 1 mục bên trái rồi chọn cặp tương ứng bên phải
                  </span>
                  <span>
                    {startNum}–{endNum}/{totalQuestions}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {/* Cột trái */}
                  <div className="space-y-2">
                    {sec.pairs.map((p, idx) => {
                      const isSelected =
                        activeMatchLeft?.blockId === sec.id &&
                        activeMatchLeft.pairId === p.pairId;
                      const pairedRight = blockMap[p.pairId];
                      return (
                        <button
                          key={p.pairId}
                          type="button"
                          onClick={() =>
                            handleMatchPairClick(sec.id, "left", p.pairId)
                          }
                          className={`flex w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                            isSelected
                              ? "border-brand bg-brand/15 text-brand-hover"
                              : pairedRight
                                ? "border-emerald-500/40 bg-emerald-500/10 text-ink"
                                : "border-line bg-bg text-ink hover:border-brand-hover"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                              isSelected
                                ? "bg-brand text-white"
                                : pairedRight
                                  ? "bg-emerald-600 text-white"
                                  : "bg-card text-muted"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 break-words">
                            {p.promptText}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Cột phải */}
                  <div className="space-y-2">
                    {sec.shuffledAnswers.map((ans) => {
                      const pairedNum = rightToLeftNumber.get(ans.pairId);
                      return (
                        <button
                          key={ans.pairId}
                          type="button"
                          onClick={() =>
                            handleMatchPairClick(sec.id, "right", ans.pairId)
                          }
                          className={`flex w-full items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left text-sm font-medium transition ${
                            pairedNum
                              ? "border-emerald-500/40 bg-emerald-500/10 text-ink"
                              : activeMatchLeft?.blockId === sec.id
                                ? "border-dashed border-brand/60 bg-bg text-ink hover:border-brand"
                                : "border-line bg-bg text-ink hover:border-brand-hover"
                          }`}
                        >
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                              pairedNum
                                ? "bg-emerald-600 text-white"
                                : "bg-card text-muted"
                            }`}
                          >
                            {pairedNum ?? "?"}
                          </span>
                          <span className="min-w-0 flex-1 break-words">
                            {ans.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          }

          // Tự luận
          const num = startNum;
          return (
            <div
              key={sec.id}
              className="rounded-3xl border border-line bg-card p-5 sm:p-6"
            >
              <div className="flex items-center justify-between text-xs font-bold text-muted">
                <span>Tự luận · {sec.promptLabel}</span>
                <span>
                  {num}/{totalQuestions}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xl font-bold text-ink">
                  {sec.promptText}
                </span>
                {sec.answerSide === "meaning" && (
                  <button
                    type="button"
                    onClick={() => speakTts(sec.word.word)}
                    className="rounded-full p-1 text-muted hover:bg-bg hover:text-ink"
                    aria-label="Phát âm"
                  >
                    <Volume2 size={15} />
                  </button>
                )}
              </div>

              <input
                type="text"
                value={writtenAnswers[sec.id] ?? ""}
                onChange={(e) =>
                  setWrittenAnswers((prev) => ({
                    ...prev,
                    [sec.id]: e.target.value,
                  }))
                }
                placeholder={
                  sec.answerSide === "term"
                    ? "Nhập thuật ngữ tiếng Anh..."
                    : "Nhập nghĩa tiếng Việt..."
                }
                className="mt-4 w-full rounded-2xl border border-line bg-bg px-4 py-3 text-sm font-medium text-ink focus:border-brand focus:outline-none"
              />
            </div>
          );
        })}
      </div>

      {/* Thanh nộp bài */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-card p-4 sm:p-5">
        <div className="text-sm text-muted">
          Đã hoàn thành{" "}
          <span className="font-bold text-ink">
            {answeredCount}/{totalQuestions}
          </span>{" "}
          câu
        </div>
        <button
          type="button"
          onClick={handleSubmitTest}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-hover"
        >
          <ClipboardCheck size={16} /> Nộp bài kiểm tra
        </button>
      </div>
    </div>
  );
}
