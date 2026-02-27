export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel deployment uses serverless endpoints without local sqlite state.
  return res.status(200).json({
    total: 0,
    in_stock: 0,
    issued: 0,
    returned: 0,
    faulty: 0,
    scrapped: 0,
  });
}
