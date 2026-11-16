const pendingLabels = new Map<string, string>();

export function setActivityLabel(path: string, label: string) {
  pendingLabels.set(path, label);
}

export function consumeActivityLabel(path: string): string | undefined {
  const val = pendingLabels.get(path);
  if (val) pendingLabels.delete(path);
  return val;
}
