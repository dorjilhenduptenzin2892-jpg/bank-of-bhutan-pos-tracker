const DEFAULT_GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx9QVXJcIphAlZQsGw7q-RAmvJMdvPRUFrut9wPQHxRiOlGbwq-IURQ7aD0XabrZo8OEQ/exec";

function getScriptUrl(): string {
  return (
    process.env.VITE_GOOGLE_SCRIPT_URL ||
    process.env.GOOGLE_SCRIPT_URL ||
    DEFAULT_GOOGLE_SCRIPT_URL
  );
}

function extractJsonArray(text: string) {
  let jsonStr = text.trim();
  const start = jsonStr.indexOf("[");
  const end = jsonStr.lastIndexOf("]");

  if (start !== -1 && end !== -1 && start < end) {
    jsonStr = jsonStr.substring(start, end + 1);
  }

  return JSON.parse(jsonStr);
}

function getGoogleHint(text: string): string {
  const lower = text.toLowerCase();

  if (lower.includes("servicelogin") || lower.includes("google account")) {
    return "Google login page returned. In Apps Script deployment, set access to Anyone and redeploy.";
  }

  if (lower.includes("script function not found")) {
    return "Apps Script endpoint is reachable, but doGet/doPost handler is missing or mismatched.";
  }

  if (lower.includes("exception:") || lower.includes("error")) {
    return "Apps Script returned an internal error. Check Apps Script execution logs.";
  }

  return "Google response was not valid JSON.";
}

function shortText(text: string, max = 500): string {
  return text.substring(0, max);
}

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
