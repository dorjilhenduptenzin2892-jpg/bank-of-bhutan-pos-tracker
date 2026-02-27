export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // No persistent stock table on Vercel serverless mode.
  return res.status(200).json([]);
}
