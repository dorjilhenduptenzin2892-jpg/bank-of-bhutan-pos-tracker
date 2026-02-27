import { extractJsonArray, getScriptUrl } from "./_shared";

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
        details: text.substring(0, 500),
      });
    }

    const data = extractJsonArray(text);
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch stock from cloud.",
      details: error?.message || "Unknown error",
    });
  }
}
