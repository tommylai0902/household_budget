import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { SCAN_REQUEST_OPTS, scanErrorResponse } from "./gemini.js";
import { ocrText } from "./vision.js";
import { parseReceiptText } from "../src/lib/receiptOcr.js";

// Runs server-side only — GEMINI_API_KEY never reaches the browser.
// (A VITE_ prefixed key would be bundled into the client JS and readable by anyone.)

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_B64 = 5_000_000; // ~3.7MB decoded; Vercel caps the request body at 4.5MB
// ponytail: a multi-page PDF invoice can exceed this — send one such doc and it 413s.
// Chunk/paginate only if real invoices actually run long; household receipts don't.

// Vercel pre-parses JSON into req.body; the Vite dev middleware does not.
async function readBody(req) {
  if (req.body) return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { GEMINI_API_KEY, GOOGLE_VISION_CREDENTIALS_JSON, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY is not set" });

  try {
    // wantItems: the Vision path never returns line items (see receiptOcr.js's
    // findItems), so this is how the user asks for the one thing it can't do —
    // a deliberate, per-receipt opt-in to spending a Gemini call.
    const { image, mediaType, categories, token, lang, wantItems } = await readBody(req);

    // ---- validate input (public endpoint: bad input must not reach the model) ----
    if (typeof image !== "string" || !image) return res.status(400).json({ error: "image required" });
    if (image.length > MAX_B64) return res.status(413).json({ error: "image too large" });
    if (!MEDIA_TYPES.includes(mediaType)) return res.status(400).json({ error: "unsupported image type" });
    const names = Array.isArray(categories) ? categories.filter((c) => typeof c === "string" && c) : [];
    if (!names.length) return res.status(400).json({ error: "categories required" });
    // Whitelisted, not interpolated raw — this string lands inside the model prompt.
    const targetLanguage = {
      zh: "Traditional Chinese", "zh-Hans": "Simplified Chinese", fr: "French", es: "Spanish",
    }[lang] || "English";

    // ---- authorize: this endpoint calls a metered API, so it can't be open to the world.
    // The caller's Supabase token must belong to somebody on the `members` allowlist.
    if (!token) return res.status(401).json({ error: "not signed in" });
    const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: member } = await supabase.from("members").select("user_id").maybeSingle();
    if (!member) return res.status(403).json({ error: "not a household member" });

    const today = new Date().toISOString().slice(0, 10);

    // ---- try Vision OCR + regex first: free/generous quota, and covers the
    // common well-formatted receipt without spending a Gemini call at all.
    // PDFs skip this path — Vision's image OCR doesn't read them; Gemini does.
    if (mediaType !== "application/pdf" && !wantItems) {
      const text = await ocrText(image, mediaType, GOOGLE_VISION_CREDENTIALS_JSON);
      // ponytail: SCAN_DEBUG_OCR dumps the raw OCR of a *successful* parse too,
      // which is the only way to collect real fixtures once parsing stops
      // falling back. Local-only opt-in — never set it in Vercel, receipts are
      // personal data and this writes them to the log verbatim.
      if (text && process.env.SCAN_DEBUG_OCR) console.log(`scan-receipt: OCR text was:\n${text}\n--- end ---`);
      const parsed = text && parseReceiptText(text, { today, categoryNames: names });
      if (parsed) return res.status(200).json(parsed);
      console.log(
        !text ? "scan-receipt: Vision returned no text, falling back to Gemini"
          : `scan-receipt: regex not confident, falling back to Gemini. OCR text was:\n${text}`,
      );
    }

    // ---- fall back to Gemini: Vision either isn't configured, or the regex
    // parse wasn't confident (no recognisable total/merchant line) ----
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const interaction = await client.interactions.create({
      model: "gemini-3.5-flash",
      system_instruction:
        "You read photos or PDFs of retail receipts and invoices. " +
        "Amount is the final total actually paid, including tax and tip, read exactly as " +
        "printed on the receipt — do not convert it from whatever currency it's printed in. " +
        `If no date is printed on the receipt, use ${today}. ` +
        "Description is the merchant name, or what was bought if the merchant is unclear. " +
        `Give the description in ${targetLanguage}, translating it if the receipt is in another language. ` +
        "Also identify the ISO 4217 currency code the amount is printed in (e.g. USD, JPY, EUR), " +
        "from an explicit symbol/code or the country the receipt is from. This is for display " +
        "only — it does not change the amount, which stays exactly as printed. " +
        "Pick the closest category from the allowed list. " +
        "Also list the individual line items with their printed prices, in the order they " +
        "appear. Use the price for that line as printed — do not add tax to it, and do not " +
        "invent items. Skip subtotal, tax, total, change and payment-method lines. " +
        "If the line items are not legible, return an empty items list rather than guessing.",
      input: [
        { type: "text", text: "Extract this receipt." },
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
            description: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            date: { type: "string" },
            category: { type: "string", enum: names },
            // Line items as printed, pre-tax. The client prorates tax across
            // whichever ones are kept, so these must not already include it.
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" }, price: { type: "number" } },
                required: ["name", "price"],
              },
            },
          },
          required: ["description", "amount", "currency", "date", "category", "items"],
        },
      },
    }, SCAN_REQUEST_OPTS);

    const text = interaction.output_text;
    if (!text) return res.status(422).json({ error: "could not read that image" });

    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return scanErrorResponse(res, e, "scan-receipt");
  }
}
