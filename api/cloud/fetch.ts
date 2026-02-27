import { extractJsonArray, getGoogleHint, getScriptUrl, shortText } from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const scriptUrl = getScriptUrl();

  if (scriptUrl.includes("docs.google.com/spreadsheets")) {
    return res.status(400).json({
      error: "Wrong URL Type",
      details:
        "Use the Google Apps Script Web App URL from Deploy > Manage deployments.",
    });
  }

  if (!scriptUrl.includes("script.google.com/macros/s/") || !scriptUrl.includes("/exec")) {
    return res.status(400).json({
      error: "Invalid Web App URL",
      details: "URL must look like https://script.google.com/macros/s/.../exec",
    });
  }

  try {
    const response = await fetch(scriptUrl, { method: "GET", redirect: "follow" });
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
      error: "Failed to connect to Google.",
      details: error?.message || "Unknown error",
    });
  }
}
