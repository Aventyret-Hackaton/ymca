import type { Template } from "./classify";

const STORAGE_KEY = "ymca-templates";
const NAME_KEY = "ymca-name";

/** Control poses, stored as templates alongside the letters. */
export const SPACE = "MELLANSLAG";
export const BACKSPACE = "SUDDA";
export const SEND = "SKICKA";

export const LABELS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", SPACE, BACKSPACE, SEND];

/** Everyone's committed templates, keyed by the person's file name (templates/<name>.json). */
export type SharedTemplates = Record<string, Template[]>;

function isTemplateList(value: unknown): value is Template[] {
  return (
    Array.isArray(value) &&
    value.every((t) => typeof t?.label === "string" && Array.isArray(t?.points))
  );
}

/** Turns what the person typed into a safe file name: "Åsa K" becomes "asa-k". */
export function toFileName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // drop accents: å becomes a
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage blocked: the name then only lives until the page is reloaded.
  }
}

/** Fetches every person's templates from the repo (see vite.config.ts). */
export async function loadSharedTemplates(): Promise<SharedTemplates> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}shared-templates.json`);
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(Object.entries(parsed).filter(([, list]) => isTemplateList(list)));
    }
  } catch {
    // No shared templates available.
  }
  return {};
}

/**
 * This device's own templates. Null when nothing has been recorded here yet,
 * in which case the person's file in the repo is the starting point.
 */
export function loadOwnTemplates(): Template[] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isTemplateList(parsed)) return parsed;
    }
  } catch {
    // Storage blocked or corrupt.
  }
  return null;
}

export function saveOwnTemplates(templates: Template[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage blocked: templates then only live until the page is reloaded.
  }
}

export function exportTemplates(templates: Template[], name: string): void {
  const blob = new Blob([JSON.stringify(templates)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${name || "templates"}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Writes the templates to templates/<name>.json on the computer running the
 * dev server (see vite.config.ts). Only works in development.
 */
export async function saveTemplatesToRepo(templates: Template[], name: string): Promise<void> {
  const response = await fetch(`/__save-templates?name=${encodeURIComponent(name)}`, {
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
