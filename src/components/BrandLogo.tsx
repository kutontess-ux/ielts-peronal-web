import React from "react";

interface OwlIconProps {
  className?: string;
}

export function OwlIcon({ className = "w-8 h-8" }: OwlIconProps) {
  return (
    <svg
      viewBox="40 32 120 132"
      className={className}
      aria-hidden="true"
    >
      {/* Ears / Tufts */}
      <path d="M58 56 Q48 34 68 46 Z" fill="#4F46E5" />
      <path d="M142 56 Q152 34 132 46 Z" fill="#4F46E5" />

      {/* Body */}
      <rect x="52" y="44" width="96" height="110" rx="46" fill="#6366F1" />

      {/* Belly */}
      <ellipse cx="100" cy="116" rx="34" ry="32" fill="#E0E7FF" />
      <path
        d="M88 106 Q93 111 98 106 M102 106 Q107 111 112 106 M95 117 Q100 122 105 117"
        stroke="#A5B4FC"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Wings */}
      <ellipse
        cx="48"
        cy="108"
        rx="12"
        ry="26"
        transform="rotate(14 48 108)"
        fill="#4338CA"
      />
      <ellipse
        cx="152"
        cy="108"
        rx="12"
        ry="26"
        transform="rotate(-14 152 108)"
        fill="#4338CA"
      />

      {/* Feet */}
      <ellipse cx="82" cy="156" rx="10" ry="5" fill="#F59E0B" />
      <ellipse cx="118" cy="156" rx="10" ry="5" fill="#F59E0B" />

      {/* Face Mask */}
      <circle cx="80" cy="80" r="20" fill="#FFFFFF" />
      <circle cx="120" cy="80" r="20" fill="#FFFFFF" />

      {/* Eyes */}
      <circle cx="82" cy="80" r="8.5" fill="#1E1B4B" />
      <circle cx="85" cy="77" r="3" fill="#FFFFFF" />
      <circle cx="118" cy="80" r="8.5" fill="#1E1B4B" />
      <circle cx="121" cy="77" r="3" fill="#FFFFFF" />

      {/* Glasses */}
      <g stroke="#312E81" strokeWidth="2.6" fill="none">
        <circle cx="80" cy="80" r="16" />
        <circle cx="120" cy="80" r="16" />
        <line x1="96" y1="80" x2="104" y2="80" />
      </g>

      {/* Beak */}
      <path
        d="M94 87 L106 87 L100 96 Z"
        fill="#F59E0B"
        stroke="#D97706"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Blush */}
      <ellipse cx="64" cy="92" rx="6" ry="3.5" fill="#FDA4AF" opacity="0.7" />
      <ellipse cx="136" cy="92" rx="6" ry="3.5" fill="#FDA4AF" opacity="0.7" />

      {/* Open Book */}
      <path
        d="M62 128 L100 135 L138 128 L138 152 L100 158 L62 152 Z"
        fill="#0EA5E9"
        stroke="#0284C7"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M65 126 L100 133 L100 154 L65 148 Z"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="1"
      />
      <path
        d="M135 126 L100 133 L100 154 L135 148 Z"
        fill="#F8FAFC"
        stroke="#CBD5E1"
        strokeWidth="1"
      />
    </svg>
  );
}

interface BrandLogoProps {
  iconClassName?: string;
  textClassName?: string;
}

export function BrandLogo({
  iconClassName = "w-7 h-7",
  textClassName = "text-lg",
}: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${textClassName}`}>
      <OwlIcon className={`${iconClassName} shrink-0`} />
      <span>
        LonTon<span className="text-brand-hover">Vocab</span>
      </span>
    </span>
  );
}
