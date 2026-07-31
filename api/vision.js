// Thin wrapper around Cloud Vision's REST OCR — the "read the pixels" half of
// the Vision+regex/Gemini-fallback pipeline. Returns null on any failure
// (missing/bad credentials, quota, unreadable image) rather than throwing:
// the caller's contract is "try the cheap path, fall back to Gemini if it
// doesn't pan out", so a Vision problem should never be fatal to the request.
//
// Auth is a service-account key (ADC), not a bare API key — this org's GCP
// policy (iam.disableServiceAccountKeyCreation off but plain API keys
// disallowed) blocks the simpler `?key=` form. GOOGLE_VISION_CREDENTIALS_JSON
// holds the downloaded key file's contents as one line; google-auth-library
// turns that into a bearer token and caches/refreshes it across warm
// invocations of the same function instance — cheap to call on every request.
import { GoogleAuth } from "google-auth-library";

let authClient = null;
async function getClient(credentialsJson) {
  if (authClient) return authClient;
  const credentials = JSON.parse(credentialsJson);
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  authClient = await auth.getClient();
  return authClient;
}

export async function ocrText(base64Image, mediaType, credentialsJson) {
  if (!credentialsJson) return null;
  try {
    const client = await getClient(credentialsJson);
    const { token } = await client.getAccessToken();
    if (!token) return null;

    const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Image },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        }],
      }),
    });
    if (!res.ok) { console.error("vision ocr: HTTP", res.status, await res.text()); return null; }
    const out = await res.json();
    if (out?.responses?.[0]?.error) console.error("vision ocr: API error", out.responses[0].error);
    return out?.responses?.[0]?.fullTextAnnotation?.text || null;
  } catch (e) {
    console.error("vision ocr: threw", e.message);
    authClient = null; // a bad cached client (e.g. revoked key) shouldn't wedge every future call
    return null;
  }
}
