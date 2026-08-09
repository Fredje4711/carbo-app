import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(fileURLToPath(new URL("..", import.meta.url)));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (req.method === "POST" && pathname === "/api/proxy") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      analysis: {
        meal_detected: true,
        items: [
          {
            name: "Testportie pasta",
            portion: "ongeveer 200 g gekookt",
            carbs_min_g: 48,
            carbs_best_g: 56,
            carbs_max_g: 65,
            confidence: "middel",
            reasoning: "De exacte portie en bereidingswijze blijven onzeker.",
          },
        ],
        total: { carbs_min_g: 48, carbs_best_g: 56, carbs_max_g: 65, confidence: "middel" },
        summary: "Lokale testanalyse zonder OpenAI-aanvraag.",
        assumptions: ["De portie is visueel geschat."],
      },
    }));
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("Testserver op http://127.0.0.1:4173"));
