import { CharacterLoader } from "@/components/CharacterLoader";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <CharacterLoader mode="reading" indicator="bar" size="md" />
    </div>
  );
}
