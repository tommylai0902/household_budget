import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Sibling of scan-receipt.js: same security/validation shape, different job —
// this reads a screenshot or PDF of a card/bank statement and pulls out every
// separate transaction as its own row, for the batch-import flow (Upload button
// in the Add expense form). No category classification here — the client
// re-uses the same keyword guesser it already runs on CSV rows (see lib/csv.js),
// so this schema stays deliberately small: just date/description/amount.

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_B64 = 5_000_000; // ~3.7MB decoded; Vercel caps the request body at 4.5MB
// ponytail: a long multi-page statement PDF can exceed this and 413. Chunking is
// only worth building if real statements actually run that long in practice.

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
    const { image, mediaType, token } = await readBody(req);

    // ---- validate input (public endpoint: bad input must not reach the model) ----
    if (typeof image !== "string" || !image) return res.status(400).json({ error: "image required" });
    if (image.length > MAX_B64) return res.status(413).json({ error: "file too large" });
    if (!MEDIA_TYPES.includes(mediaType)) return res.status(400).json({ error: "unsupported file type" });

    // ---- authorize: this endpoint calls a metered API, so it can't be open to the world.
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
        "You read screenshots or PDFs of credit card or bank statements listing multiple separate " +
        "transactions. Extract every purchase line as its own entry: date, description (merchant " +
        "name as printed) and amount (a positive number — the charge amount). " +
        "Skip payments, refunds, credits, and summary lines (subtotal, total, balance, interest, " +
        "fees) that are not an individual purchase. " +
        `If a row's date has no year printed, assume ${today.slice(0, 4)}. If a row has no date at ` +
        `all, use ${today}. ` +
        "If the image is actually a single receipt with one purchase rather than a statement, " +
        "still return it — as a list with that one transaction in it.",
      input: [
        { type: "text", text: "Extract every transaction from this statement." },
        mediaType === "application/pdf"
          ? { type: "document", data: image, mime_type: mediaType }
          : { type: "image", data: image, mime_type: mediaType },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            transactions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string" },
                  description: { type: "string" },
                  amount: { type: "number" },
                },
                required: ["date", "description", "amount"],
              },
            },
          },
          required: ["transactions"],
        },
      },
    });

    const text = interaction.output_text;
    if (!text) return res.status(422).json({ error: "could not read that file" });

    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    console.error("scan-statement failed:", e);
    const status = e?.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status).json({ error: e?.message || "scan failed" });
  }
}
