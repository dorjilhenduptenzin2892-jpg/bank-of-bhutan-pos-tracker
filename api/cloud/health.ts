import { getScriptUrl, shortText } from "./_shared.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const scriptUrl = getScriptUrl();

  try {
    const response = await fetch(scriptUrl, { method: "GET", redirect: "follow" });
    const text = await response.text();

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      scriptUrl,
      sample: shortText(text, 300),
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      error: "Failed to connect to Google",
      details: error?.message || "Unknown error",
      scriptUrl,
    });
  }
}
