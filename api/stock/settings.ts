export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Default settings for stateless serverless deployment.
  return res.status(200).json({
    procurement_import_locked: "false",
    expected_procurement_count: "600",
  });
}
