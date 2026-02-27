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
