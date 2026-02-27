export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // SQLite-backed stock import is only available in local server.ts runtime.
  return res.status(501).json({
    error: "Stock import is not available on Vercel serverless mode.",
    details: "Use local deployment for stock database features.",
  });
}
