/**
 * Turns a message's calories into fika: "300 such messages make a semla".
 *
 * Energy and piece size come from Open Food Facts, an open food database
 * (world.openfoodfacts.org), fetched by barcode when the app starts. The
 * numbers below are what the database said when this was written, and are
 * used until the fetch answers or if it fails, so the line always works.
 */

interface Fika {
  /** Spoken with its article: "en mazarin". */
  name: string;
  /** Shown in Slack only: speech would read the emoji's name aloud. */
  emoji: string;
  barcode: string;
  /** Energy in one piece. Replaced by the database's value when it arrives. */
  kcal: number;
}

const FIKA: Fika[] = [
  { name: "en mazarin", emoji: "🥧", barcode: "7311041085875", kcal: 237 },
  { name: "en punschrulle", emoji: "🟢", barcode: "7311043004249", kcal: 137 },
  { name: "en Singoalla", emoji: "🍪", barcode: "7310520003089", kcal: 63 },
  { name: "en Ballerina", emoji: "🍪", barcode: "7310520009326", kcal: 73 },
  { name: "en Delicatoboll", emoji: ":chokladboll:", barcode: "7315360010754", kcal: 278 },
  { name: "en bit kladdkaka", emoji: "🍫", barcode: "7310890203508", kcal: 251 },
  { name: "en semla", emoji: ":semla:", barcode: "7333192005304", kcal: 416 },
];

const API = "https://world.openfoodfacts.org/api/v2/product/";

/** Fetches current energy per piece for every item. Failures keep the built-in value. */
export function loadFika(): void {
  for (const item of FIKA) {
    fetch(`${API}${item.barcode}.json?fields=nutriments,serving_quantity`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const per100g = Number(data?.product?.nutriments?.["energy-kcal_100g"]);
        const grams = Number(data?.product?.serving_quantity);
        if (per100g > 0 && grams > 0) item.kcal = (per100g * grams) / 100;
      })
      .catch(() => {});
  }
}

export interface FikaLine {
  text: string;
  /** "" when there is no comparison. */
  emoji: string;
}

/** A sentence comparing the energy to a random fika item; empty for nothing spent. */
export function fikaLine(kcal: number): FikaLine {
  if (kcal <= 0) return { text: "", emoji: "" };
  const item = FIKA[Math.floor(Math.random() * FIKA.length)];
  if (kcal >= item.kcal) return { text: `Du har förtjänat ${item.name}!`, emoji: item.emoji };
  const messages = Math.ceil(item.kcal / kcal);
  return { text: `${messages} sådana meddelanden blir ${item.name}.`, emoji: item.emoji };
}
