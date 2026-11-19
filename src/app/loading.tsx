import { CharacterLoader } from "@/components/CharacterLoader";

export default function Loading() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center">
      <CharacterLoader mode="reading" indicator="dots" size="md" />
    </div>
  );
}
