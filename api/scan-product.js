import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { scanErrorResponse } from "./gemini.js";

// Reads a photo of a product — its barcode, or just the packaging — and
// returns what to put in an inventory item. Sibling of scan-receipt.js: same
// auth, validation and error shape, different question asked of the model.
//
// Why a photo rather than a real barcode decoder: the browser BarcodeDetector
// API doesn't exist in Safari, and this app is used as an iPhone PWA. The
// alternative is shipping a JS decoder (zxing/quagga, a few hundred KB) that
// would then need a UPC database to turn digits into a product name anyway.
// The camera pipeline for this already exists and already works on iOS, and
// reading the label beats a barcode lookup for anything not in a UPC
// database — loose produce, store brands, imported goods.

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_B64 = 5_000_000; // ~3.7MB decoded; Vercel caps the request body at 4.5MB

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
    const { image, mediaType, token, lang } = await readBody(req);

    if (typeof image !== "string" || !image) return res.status(400).json({ error: "image required" });
    if (image.length > MAX_B64) return res.status(413).json({ error: "image too large" });
    if (!MEDIA_TYPES.includes(mediaType)) return res.status(400).json({ error: "unsupported image type" });
    // Whitelisted, not interpolated raw — this string lands inside the prompt.
    const targetLanguage = {
      zh: "Traditional Chinese", "zh-Hans": "Simplified Chinese", fr: "French", es: "Spanish",
    }[lang] || "English";

    // This endpoint calls a metered API, so it can't be open to the world.
    if (!token) return res.status(401).json({ error: "not signed in" });
    const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: member } = await supabase.from("members").select("user_id").maybeSingle();
    if (!member) return res.status(403).json({ error: "not a household member" });

    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const interaction = await client.interactions.create({
      model: "gemini-3.5-flash",
      system_instruction:
        "You identify a single retail product from a photo of it or of its barcode. " +
        "Name is what the thing is, short enough to sit in a shopping list — " +
        "'Whole milk', not the full marketing name off the front of the carton. " +
        `Give the name in ${targetLanguage}. ` +
        "Brand is the manufacturer as printed, left empty if there isn't one or it isn't legible. " +
        "Unit is the pack size's unit of measure only, as printed: 'L', 'mL', 'g', 'kg', " +
        "'ea' for a countable item. Not the number, just the unit. " +
        "Barcode is the digits printed under the barcode if they are legible, otherwise empty. " +
        "If the photo shows no identifiable product, return an empty name rather than guessing.",
      input: [
        { type: "text", text: "What product is this?" },
        { type: "image", data: image, mime_type: mediaType },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            brand: { type: "string" },
            unit: { type: "string" },
            barcode: { type: "string" },
          },
          required: ["name", "brand", "unit", "barcode"],
        },
      },
    });

    const text = interaction.output_text;
    if (!text) return res.status(422).json({ error: "could not read that image" });

    const out = JSON.parse(text);
    if (!out.name?.trim()) return res.status(422).json({ error: "no_product", code: "no_product" });
    return res.status(200).json(out);
  } catch (e) {
    return scanErrorResponse(res, e, "scan-product");
  }
}
