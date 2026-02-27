export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];

  // Vercel deployment does not include the local SQLite stock engine.
  // Return a successful no-op response so payment/cloud sync remains stable.
  return res.status(200).json({
    success: true,
    updated: 0,
    ignored: assignments.length,
    notFound: 0,
    mode: "no-op",
  });
}
