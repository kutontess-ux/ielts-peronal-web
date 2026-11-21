export function QuizletSetIcon({
  size = 22,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Thẻ phía sau */}
      <rect
        x="8"
        y="3.5"
        width="10.5"
        height="13.5"
        rx="2"
        transform="rotate(8 13.25 10.25)"
        stroke="currentColor"
        strokeWidth="1.9"
      />
      {/* Thẻ phía trước */}
      <rect
        x="4.5"
        y="6"
        width="11"
        height="14"
        rx="2"
        transform="rotate(-8 10 13)"
        fill="#eaf4ff"
        className="dark:fill-[#1d2246]"
        stroke="currentColor"
        strokeWidth="1.9"
      />
    </svg>
  );
}
