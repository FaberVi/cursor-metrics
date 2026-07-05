const MODEL_LABELS: Record<string, string> = {
  default: "Auto",
};

export function formatModelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}
