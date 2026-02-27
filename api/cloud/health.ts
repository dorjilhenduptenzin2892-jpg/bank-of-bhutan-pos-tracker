const DEFAULT_GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyOz63Aehz-FiImn4NacvVk8-ZRH5r33G0UTgg5qZVTCNUTqHy_S0PIkuvCPanyD5pNpA/exec";

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
