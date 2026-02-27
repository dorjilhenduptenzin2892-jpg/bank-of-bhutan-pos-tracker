import { getScriptUrl } from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const scriptUrl = getScriptUrl();

  try {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      redirect: "follow",
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Google Script returned HTTP ${response.status}`,
        details: text.substring(0, 500),
      });
    }

    return res.status(200).json({ success: true });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to proxy sync to Google Script",
      details: error?.message || "Unknown error",
    });
  }
}
