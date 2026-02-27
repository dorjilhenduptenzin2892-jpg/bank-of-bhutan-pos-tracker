const DEFAULT_GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwLoBCeCIUTBgv1Whd5QbJZRJJIG5t0peaTcCteoArEd8X70J-8QCzyh3CPH7qZZOi7Qg/exec";

export function getScriptUrl(): string {
  return (
    process.env.VITE_GOOGLE_SCRIPT_URL ||
    process.env.GOOGLE_SCRIPT_URL ||
    DEFAULT_GOOGLE_SCRIPT_URL
  );
}

export function extractJsonArray(text: string) {
  let jsonStr = text.trim();
  const start = jsonStr.indexOf("[");
  const end = jsonStr.lastIndexOf("]");

  if (start !== -1 && end !== -1 && start < end) {
    jsonStr = jsonStr.substring(start, end + 1);
  }

  return JSON.parse(jsonStr);
}

export function getGoogleHint(text: string): string {
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

export function shortText(text: string, max = 500): string {
  return text.substring(0, max);
}
