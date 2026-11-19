"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

export default function SwRegistrar() {
  useEffect(() => {
    registerServiceWorker().catch(() => {});
  }, []);

  return null;
}
