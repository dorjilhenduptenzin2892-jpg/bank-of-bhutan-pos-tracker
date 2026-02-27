import { extractJsonArray, getGoogleHint, getScriptUrl, shortText } from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const scriptUrl = getScriptUrl();

  try {
    const url = `${scriptUrl}${scriptUrl.includes("?") ? "&" : "?"}action=stock`;
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Google Script returned HTTP ${response.status}`,
        details: shortText(text),
      });
    }

    try {
      const data = extractJsonArray(text);
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({
        error: "Google Script returned invalid JSON",
        details: shortText(text),
        hint: getGoogleHint(text),
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch stock from cloud.",
      details: error?.message || "Unknown error",
    });
  }
}
