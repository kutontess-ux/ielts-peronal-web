"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface HorizontalCarouselProps {
  children: ReactNode;
  itemCount: number;
  showDots?: boolean;
  /** Chế độ cuộn từng thẻ (card) hay cuộn một khoảng rộng (~80% khung) khi bấm nút trên PC */
  stepMode?: "card" | "page";
  className?: string;
  trackClassName?: string;
  ariaLabel?: string;
}

export function HorizontalCarousel({
  children,
  itemCount,
  showDots = false,
  stepMode = "card",
  className = "",
  trackClassName = "",
  ariaLabel = "Danh sách cuộn ngang",
}: HorizontalCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const userInteractedRef = useRef(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(maxScroll > 4 && el.scrollLeft < maxScroll - 4);

    if (showDots && el.children.length > 0) {
      const scrollLeft = el.scrollLeft;
      let closestIdx = 0;
      let minDiff = Infinity;
      const childrenArr = Array.from(el.children) as HTMLElement[];
      for (let i = 0; i < childrenArr.length; i++) {
        const childLeft = childrenArr[i].offsetLeft - el.offsetLeft;
        const diff = Math.abs(childLeft - scrollLeft);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      // Nếu đã cuộn tới cuối cùng thì highlight chấm cuối
      if (maxScroll > 4 && scrollLeft >= maxScroll - 6) {
        closestIdx = childrenArr.length - 1;
      }
      setActiveIndex(closestIdx);
    }
  }, [showDots]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    if (!userInteractedRef.current && el.scrollLeft !== 0) {
      el.scrollLeft = 0;
    }

    const raf = requestAnimationFrame(() => {
      if (!userInteractedRef.current && el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
      updateScrollState();
    });
    const ro = new ResizeObserver(() => {
      updateScrollState();
    });
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [updateScrollState, itemCount]);

  const scrollToIndex = useCallback((idx: number) => {
    userInteractedRef.current = true;
    const el = trackRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(el.children.length - 1, idx));
    const target = el.children[clamped] as HTMLElement | undefined;
    if (!target) return;
    const left = target.offsetLeft - el.offsetLeft;
    el.scrollTo({ left, behavior: "smooth" });
  }, []);

  const handleStep = useCallback(
    (dir: -1 | 1) => {
      userInteractedRef.current = true;
      const el = trackRef.current;
      if (!el) return;

      if (stepMode === "card" && el.children.length > 0) {
        const childrenArr = Array.from(el.children) as HTMLElement[];
        const curLeft = el.scrollLeft;
        if (dir === 1) {
          const nextEl = childrenArr.find(
            (c) => c.offsetLeft - el.offsetLeft > curLeft + 12
          );
          if (nextEl) {
            el.scrollTo({
              left: nextEl.offsetLeft - el.offsetLeft,
              behavior: "smooth",
            });
            return;
          }
        } else {
          const prevCandidates = childrenArr.filter(
            (c) => c.offsetLeft - el.offsetLeft < curLeft - 12
          );
          const prevEl = prevCandidates[prevCandidates.length - 1];
          if (prevEl) {
            el.scrollTo({
              left: prevEl.offsetLeft - el.offsetLeft,
              behavior: "smooth",
            });
            return;
          }
        }
      }

      const delta = Math.max(260, Math.round(el.clientWidth * 0.78)) * dir;
      el.scrollBy({ left: delta, behavior: "smooth" });
    },
    [stepMode]
  );

  return (
    <div className={`relative group/carousel ${className}`}>
      {/* Nút điều hướng trái (chỉ hiện trên PC) */}
      {canPrev && (
        <button
          type="button"
          onClick={() => handleStep(-1)}
          aria-label="Xem mục trước"
          className="absolute left-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card/95 text-ink shadow-lg backdrop-blur transition hover:scale-105 hover:border-brand-hover hover:bg-card md:flex"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
      )}

      {/* Vùng cuộn ngang (vuốt tay trên điện thoại, snap mượt) */}
      <div
        ref={trackRef}
        onScroll={updateScrollState}
        onTouchStart={() => { userInteractedRef.current = true; }}
        onWheel={() => { userInteractedRef.current = true; }}
        onPointerDown={() => { userInteractedRef.current = true; }}
        role="region"
        aria-label={ariaLabel}
        className={`flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-smooth [overflow-anchor:none] no-scrollbar pb-1 ${trackClassName}`}
      >
        {children}
      </div>

      {/* Nút điều hướng phải (chỉ hiện trên PC) */}
      {canNext && (
        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label="Xem mục tiếp theo"
          className="absolute right-2 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-card/95 text-ink shadow-lg backdrop-blur transition hover:scale-105 hover:border-brand-hover hover:bg-card md:flex"
        >
          <ChevronRight size={20} strokeWidth={2.2} />
        </button>
      )}

      {/* Chấm chỉ báo vị trí giống Quizlet */}
      {showDots && itemCount > 1 && (
        <div className="mt-3.5 flex items-center justify-center gap-2">
          {Array.from({ length: itemCount }).map((_, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={i}
                type="button"
                onClick={() => scrollToIndex(i)}
                aria-label={`Chuyển đến thẻ ${i + 1}`}
                aria-current={active ? "true" : undefined}
                className={`h-2 w-2 rounded-full transition-colors ${
                  active
                    ? "bg-brand dark:bg-brand-hover"
                    : "bg-[#d9dde8] hover:bg-muted dark:bg-line"
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
