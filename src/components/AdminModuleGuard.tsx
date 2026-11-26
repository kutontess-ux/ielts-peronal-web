"use client";

import type { ReactNode } from "react";
import { useMe } from "@/lib/use-me";
import { CharacterLoader } from "@/components/CharacterLoader";
import { UnderDevelopmentView } from "@/components/UnderDevelopmentView";

export function AdminModuleGuard({
  title,
  loaderMode = "reading",
  children,
}: {
  title: string;
  loaderMode?: "reading" | "writing";
  children: ReactNode;
}) {
  const { isAdmin, meLoaded } = useMe();

  if (!meLoaded) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <CharacterLoader mode={loaderMode} indicator="dots" size="md" />
      </div>
    );
  }

  if (!isAdmin) {
    return <UnderDevelopmentView title={title} />;
  }

  return <>{children}</>;
}
