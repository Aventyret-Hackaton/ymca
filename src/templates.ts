import type { Template } from "./classify";

const STORAGE_KEY = "ymca-templates";

/** Control poses, stored as templates alongside the letters. */
export const SPACE = "MELLANSLAG";
export const BACKSPACE = "SUDDA";
export const SEND = "SKICKA";

export const LABELS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", SPACE, BACKSPACE, SEND];

function isTemplateList(value: unknown): value is Template[] {
  return (
    Array.isArray(value) &&
    value.every((t) => typeof t?.label === "string" && Array.isArray(t?.points))
  );
}

/**
 * Templates recorded on this device win. Otherwise the shared set committed
 * to the repo (public/templates.json) is used.
 */
export async function loadTemplates(): Promise<Template[]> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isTemplateList(parsed)) return parsed;
    }
  } catch {
    // Storage blocked or corrupt: fall through to the shared set.
  }
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}templates.json`);
    const parsed: unknown = await response.json();
    if (isTemplateList(parsed)) return parsed;
  } catch {
    // No shared set available.
  }
  return [];
}

export function saveTemplates(templates: Template[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage blocked: templates then only live until the page is reloaded.
  }
}

export function exportTemplates(templates: Template[]): void {
  const blob = new Blob([JSON.stringify(templates)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "templates.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Writes the templates to public/templates.json on the computer running the
 * dev server (see vite.config.ts). Only works in development.
 */
export async function saveTemplatesToRepo(templates: Template[]): Promise<void> {
  const response = await fetch("/__save-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(templates),
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function importTemplates(file: File): Promise<Template[]> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isTemplateList(parsed)) throw new Error("Filen innehåller inga mallar");
  return parsed;
}
