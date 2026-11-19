"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CharacterLoader } from "@/components/CharacterLoader";

function BankRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const book = searchParams.get("book");

  useEffect(() => {
    const target =
      tab === "book"
        ? book
          ? `/vocab?tab=books&book=${encodeURIComponent(book)}`
          : "/vocab?tab=books"
        : "/vocab/stats?tab=bank";
    router.replace(target);
  }, [router, tab, book]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <CharacterLoader mode="reading" indicator="dots" size="md" />
      <p className="text-sm text-muted">Đang chuyển trang...</p>
    </div>
  );
}

export default function BankRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <CharacterLoader mode="reading" indicator="dots" size="md" />
        </div>
      }
    >
      <BankRedirectInner />
    </Suspense>
  );
}
