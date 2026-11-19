import React from 'react';

export type CharacterLoaderMode = 'reading' | 'listening' | 'writing' | 'success';
export type CharacterLoaderIndicator = 'bar' | 'dots';
export type CharacterLoaderSize = 'sm' | 'md' | 'lg';

interface CharacterLoaderProps {
  mode?: CharacterLoaderMode;
  indicator?: CharacterLoaderIndicator;
  size?: CharacterLoaderSize;
  className?: string;
}

const SIZE_CLASSES: Record<CharacterLoaderSize, string> = {
  sm: 'w-24 h-24',
  md: 'w-36 h-36',
  lg: 'w-44 h-44',
};

const BAR_WIDTH_CLASSES: Record<CharacterLoaderSize, string> = {
  sm: 'w-20',
  md: 'w-28',
  lg: 'w-36',
};

export function CharacterLoader({
  mode = 'reading',
  indicator = 'bar',
  size = 'md',
  className = '',
}: CharacterLoaderProps) {
  const bodyAnimation =
    mode === 'listening'
      ? 'owl-anim-groove'
      : mode === 'success'
        ? 'owl-anim-celebrate'
        : 'owl-anim-float';

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 select-none ${className}`}
      role="status"
      aria-label="Loading"
    >
      <svg
        viewBox="0 0 200 190"
        className={`${SIZE_CLASSES[size]} overflow-visible`}
        aria-hidden="true"
      >
        {/* Ground Shadow */}
        <ellipse
          cx="100"
          cy="176"
          rx="44"
          ry="7"
          fill="currentColor"
          className="text-ink owl-anim-shadow"
        />

        {/* Sparkles (Success mode) */}
        {mode === 'success' && (
          <g>
            <path
              d="M36 52 L39 44 L42 52 L50 55 L42 58 L39 66 L36 58 L28 55 Z"
              fill="#FBBF24"
              className="owl-anim-sparkle-1"
            />
            <path
              d="M162 44 L164.5 37 L167 44 L174 46.5 L167 49 L164.5 56 L162 49 L155 46.5 Z"
              fill="#34D399"
              className="owl-anim-sparkle-2"
            />
            <circle
              cx="155"
              cy="108"
              r="4"
              fill="#60A5FA"
              className="owl-anim-sparkle-1"
            />
            <circle
              cx="44"
              cy="112"
              r="3.5"
              fill="#F472B6"
              className="owl-anim-sparkle-2"
            />
          </g>
        )}

        {/* Music Notes (Listening mode) */}
        {mode === 'listening' && (
          <g>
            <g className="owl-anim-note-1">
              <path
                d="M40 62 V44 L52 41 V57"
                stroke="#60A5FA"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="37" cy="62" r="4" fill="#60A5FA" />
              <circle cx="49" cy="57" r="4" fill="#60A5FA" />
            </g>
            <g className="owl-anim-note-2">
              <path
                d="M156 54 V38 L165 41"
                stroke="#A78BFA"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="153" cy="54" r="4" fill="#A78BFA" />
            </g>
          </g>
        )}

        {/* Main Owl Character */}
        <g className={bodyAnimation}>
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
          {mode === 'success' ? (
            <g>
              <path
                d="M72 82 Q80 71 88 82"
                stroke="#1E1B4B"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M112 82 Q120 71 128 82"
                stroke="#1E1B4B"
                strokeWidth="3.5"
                fill="none"
                strokeLinecap="round"
              />
            </g>
          ) : (
            <g>
              <g className="owl-anim-blink">
                <circle cx="82" cy="80" r="8.5" fill="#1E1B4B" />
                <circle cx="85" cy="77" r="3" fill="#FFFFFF" />
              </g>
              <g className="owl-anim-blink">
                <circle cx="118" cy="80" r="8.5" fill="#1E1B4B" />
                <circle cx="121" cy="77" r="3" fill="#FFFFFF" />
              </g>
            </g>
          )}

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

          {/* Headphones (Listening mode) */}
          {mode === 'listening' && (
            <g>
              <path
                d="M48 76 C48 34, 152 34, 152 76"
                stroke="#1E293B"
                strokeWidth="7"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M50 76 C50 37, 150 37, 150 76"
                stroke="#38BDF8"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              />
              <rect
                x="38"
                y="64"
                width="14"
                height="28"
                rx="7"
                fill="#0F172A"
                stroke="#38BDF8"
                strokeWidth="2"
              />
              <rect
                x="148"
                y="64"
                width="14"
                height="28"
                rx="7"
                fill="#0F172A"
                stroke="#38BDF8"
                strokeWidth="2"
              />
            </g>
          )}

          {/* Open Book (Reading mode) */}
          {mode === 'reading' && (
            <g>
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
              <path
                d="M133 125 L100 133 L100 154 L133 147 Z"
                fill="#FFFFFF"
                stroke="#94A3B8"
                strokeWidth="1"
                className="owl-anim-page"
              />
              <line
                x1="72"
                y1="134"
                x2="92"
                y2="138"
                stroke="#94A3B8"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1="72"
                y1="140"
                x2="90"
                y2="144"
                stroke="#CBD5E1"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <line
                x1="108"
                y1="138"
                x2="128"
                y2="134"
                stroke="#94A3B8"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Notepad & Pencil (Writing mode) */}
          {mode === 'writing' && (
            <g>
              <rect
                x="68"
                y="124"
                width="54"
                height="36"
                rx="4"
                fill="#FFFBEB"
                stroke="#F59E0B"
                strokeWidth="2"
              />
              <line
                x1="76"
                y1="134"
                x2="112"
                y2="134"
                stroke="#FDE68A"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M76 142 Q85 139 93 142 T110 142"
                stroke="#6366F1"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                className="owl-anim-scribble"
              />
              <line
                x1="76"
                y1="150"
                x2="102"
                y2="150"
                stroke="#FDE68A"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <g className="owl-anim-write">
                <g transform="translate(114, 114) rotate(32)">
                  <rect
                    x="0"
                    y="0"
                    width="8"
                    height="28"
                    rx="1.5"
                    fill="#FBBF24"
                    stroke="#D97706"
                    strokeWidth="1.2"
                  />
                  <rect x="0" y="0" width="8" height="5" rx="1" fill="#F472B6" />
                  <path d="M0 28 L4 35 L8 28 Z" fill="#FDE68A" />
                  <path d="M2.5 32.5 L4 35 L5.5 32.5 Z" fill="#1E293B" />
                </g>
              </g>
            </g>
          )}

          {/* Checkmark Badge (Success mode) */}
          {mode === 'success' && (
            <g>
              <circle
                cx="100"
                cy="136"
                r="17"
                fill="#10B981"
                stroke="#FFFFFF"
                strokeWidth="2.5"
              />
              <path
                d="M92 136 L98 142 L109 130"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}
        </g>
      </svg>

      {/* Loading Indicator (no text) */}
      {mode !== 'success' && (
        indicator === 'bar' ? (
          <div
            className={`${BAR_WIDTH_CLASSES[size]} h-1.5 rounded-full bg-line overflow-hidden`}
          >
            <div className="h-full w-2/5 rounded-full bg-brand owl-anim-bar" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 h-3">
            <span className="w-2 h-2 rounded-full bg-brand owl-anim-dot-1" />
            <span className="w-2 h-2 rounded-full bg-brand owl-anim-dot-2" />
            <span className="w-2 h-2 rounded-full bg-brand owl-anim-dot-3" />
          </div>
        )
      )}
    </div>
  );
}

export default CharacterLoader;
