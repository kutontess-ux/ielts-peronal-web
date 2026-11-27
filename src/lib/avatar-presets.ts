export const AVATAR_PRESET_IDS = [
  "ocean",
  "sunset",
  "emerald",
  "violet",
  "amber",
  "rose",
  "indigo",
  "teal",
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESET_IDS)[number];

export const AVATAR_PRESET_PREFIX = "preset:";

export function parsePresetAvatar(avatarUrl: string | null | undefined): AvatarPresetId | null {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_PRESET_PREFIX)) return null;
  const id = avatarUrl.slice(AVATAR_PRESET_PREFIX.length);
  return (AVATAR_PRESET_IDS as readonly string[]).includes(id) ? (id as AvatarPresetId) : null;
}

export function toPresetAvatarUrl(id: AvatarPresetId): string {
  return `${AVATAR_PRESET_PREFIX}${id}`;
}
