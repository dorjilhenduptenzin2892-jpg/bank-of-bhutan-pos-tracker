const DEFAULT_GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx9QVXJcIphAlZQsGw7q-RAmvJMdvPRUFrut9wPQHxRiOlGbwq-IURQ7aD0XabrZo8OEQ/exec";

function getScriptUrl(): string {
  return (
    process.env.VITE_GOOGLE_SCRIPT_URL ||
    process.env.GOOGLE_SCRIPT_URL ||
    DEFAULT_GOOGLE_SCRIPT_URL
  );
}

function shortText(text: string, max = 500): string {
  return text.substring(0, max);
}

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
        details: shortText(text),
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
