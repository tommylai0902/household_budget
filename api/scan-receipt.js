import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Runs server-side only — GEMINI_API_KEY never reaches the browser.
// (A VITE_ prefixed key would be bundled into the client JS and readable by anyone.)

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_B64 = 5_000_000; // ~3.7MB decoded; Vercel caps the request body at 4.5MB

// Vercel pre-parses JSON into req.body; the Vite dev middleware does not.
async function readBody(req) {
  if (req.body) return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { GEMINI_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY is not set" });

  try {
    const { image, mediaType, categories, token } = await readBody(req);

    // ---- validate input (public endpoint: bad input must not reach the model) ----
    if (typeof image !== "string" || !image) return res.status(400).json({ error: "image required" });
    if (image.length > MAX_B64) return res.status(413).json({ error: "image too large" });
    if (!MEDIA_TYPES.includes(mediaType)) return res.status(400).json({ error: "unsupported image type" });
    const names = Array.isArray(categories) ? categories.filter((c) => typeof c === "string" && c) : [];
    if (!names.length) return res.status(400).json({ error: "categories required" });

    // ---- authorize: this endpoint calls a metered API, so it can't be open to the world.
    // The caller's Supabase token must belong to somebody on the `members` allowlist.
    if (!token) return res.status(401).json({ error: "not signed in" });
    const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: member } = await supabase.from("members").select("user_id").maybeSingle();
    if (!member) return res.status(403).json({ error: "not a household member" });

    // ---- extract ----
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const today = new Date().toISOString().slice(0, 10);

    const interaction = await client.interactions.create({
      model: "gemini-3.5-flash",
      system_instruction:
        "You read photos of retail receipts and return the single expense they represent. " +
        "Amount is the final total actually paid, including tax and tip. " +
        `If no date is printed on the receipt, use ${today}. ` +
        "Description is the merchant name, or what was bought if the merchant is unclear. " +
        "Pick the closest category from the allowed list.",
      input: [
        { type: "text", text: "Extract this receipt." },
        { type: "image", data: image, mime_type: mediaType },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            description: { type: "string" },
            amount: { type: "number" },
            date: { type: "string" },
            category: { type: "string", enum: names },
          },
          required: ["description", "amount", "date", "category"],
        },
      },
    });

    const text = interaction.output_text;
    if (!text) return res.status(422).json({ error: "could not read that image" });

    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    console.error("scan-receipt failed:", e);
    const status = e?.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status).json({ error: e?.message || "scan failed" });
  }
}
