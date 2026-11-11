import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

/** One file per person: templates/<name>.json. Nobody edits anyone else's file. */
const TEMPLATES_DIR = fileURLToPath(new URL("./templates/", import.meta.url));
/** The app fetches every person's templates from this single address. */
const SHARED_FILE = "shared-templates.json";
const NAME_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_BODY_BYTES = 2_000_000;

function isTemplateList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (t) =>
        typeof t?.label === "string" &&
        Array.isArray(t?.points) &&
        t.points.every((p: unknown) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === "number")),
    )
  );
}

/** Reads templates/*.json into { name: templates }. Broken files are skipped with a warning. */
async function readAllTemplates(): Promise<Record<string, unknown>> {
  const all: Record<string, unknown> = {};
  const files = await readdir(TEMPLATES_DIR).catch(() => [] as string[]);
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const templates: unknown = JSON.parse(await readFile(TEMPLATES_DIR + file, "utf8"));
      if (!isTemplateList(templates)) throw new Error("fel format");
      all[file.slice(0, -".json".length)] = templates;
    } catch (error) {
      console.warn(`templates/${file} hoppas över: ${(error as Error).message}`);
    }
  }
  return all;
}

/** One template per line, so that git diffs show which poses changed. */
function formatTemplates(templates: unknown[]): string {
  return `[\n${templates.map((t) => JSON.stringify(t)).join(",\n")}\n]\n`;
}

/**
 * Serves everyone's templates as one file. In the dev server it is read from
 * disk on every request; in a build it is written into dist.
 *
 * The dev server can also save a person's templates to templates/<name>.json,
 * so poses recorded on a phone can be committed. That part is not in the built
 * app. Anyone on the same network can reach it while `npm run dev:phone` is
 * running, which is why it only accepts well-formed templates and only writes
 * inside the templates folder.
 */
function templatesPlugin(): Plugin {
  return {
    name: "ymca-templates",
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: SHARED_FILE, source: JSON.stringify(await readAllTemplates()) });
    },
    configureServer(server) {
      server.middlewares.use(`/${SHARED_FILE}`, async (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(await readAllTemplates()));
      });

      server.middlewares.use("/__save-templates", (req, res) => {
        const reply = (status: number, text: string) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(text);
        };
        if (req.method !== "POST") return reply(405, "Endast POST");
        const name = new URL(req.url ?? "", "http://localhost").searchParams.get("name") ?? "";
        if (!NAME_PATTERN.test(name)) return reply(400, "Ogiltigt namn");

        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            reply(413, "För stor fil");
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", async () => {
          if (res.writableEnded) return;
          try {
            const templates: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!isTemplateList(templates)) return reply(400, "Ogiltiga mallar");
            await mkdir(TEMPLATES_DIR, { recursive: true });
            await writeFile(`${TEMPLATES_DIR}${name}.json`, formatTemplates(templates as unknown[]));
            reply(200, "Sparat");
          } catch (error) {
            reply(400, `Kunde inte spara: ${(error as Error).message}`);
          }
        });
      });
    },
  };
}

// The camera only works on HTTPS (or localhost). `npm run dev:phone` serves
// the app on the local network with a self-signed certificate so it can be
// opened on a phone.
export default defineConfig(({ mode }) => ({
  plugins: [templatesPlugin(), ...(mode === "phone" ? [basicSsl()] : [])],
}));
