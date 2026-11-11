import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

const TEMPLATES_FILE = fileURLToPath(new URL("./public/templates.json", import.meta.url));
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

/**
 * Dev server only: lets the app write recorded templates straight to
 * public/templates.json on the computer running `npm run dev`, so they can be
 * committed. It is not part of the built app. Anyone on the same network can
 * reach it while `npm run dev:phone` is running, which is why it only accepts
 * well-formed templates and only ever writes that one file.
 */
function saveTemplatesPlugin(): Plugin {
  return {
    name: "ymca-save-templates",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save-templates", (req, res) => {
        const reply = (status: number, text: string) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(text);
        };
        if (req.method !== "POST") return reply(405, "Endast POST");

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
            await writeFile(TEMPLATES_FILE, JSON.stringify(templates) + "\n");
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
  plugins: [saveTemplatesPlugin(), ...(mode === "phone" ? [basicSsl()] : [])],
}));
