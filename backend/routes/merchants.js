import express from "express";
import db from "../db.js";

const router = express.Router();

/**
 * POST /api/merchants/register
 * Registers a new merchant.
 *
 * Body: business_name, wallet_address, category, address, latitude, longitude, operating_hours
 */
router.post("/register", (req, res) => {
  const { business_name, wallet_address, category, address, latitude, longitude, operating_hours } = req.body;

  if (!business_name || !wallet_address || !category) {
    return res.status(400).json({ error: "business_name, wallet_address and category are required" });
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet_address)) {
    return res.status(400).json({ error: "Invalid wallet address format" });
  }

  const existing = db.prepare(`SELECT id FROM merchants WHERE wallet_address = ?`).get(wallet_address.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: "Merchant with this wallet address already exists" });
  }

  const result = db.prepare(`
    INSERT INTO merchants (business_name, wallet_address, category, address, latitude, longitude, operating_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    business_name,
    wallet_address.toLowerCase(),
    category,
    address ?? null,
    latitude ?? null,
    longitude ?? null,
    operating_hours ?? null
  );

  res.status(201).json({ success: true, merchant_id: result.lastInsertRowid });
});

/**
 * POST /api/merchants/trail/create
 * Merchant creates a new trail with stops.
 *
 * Body:
 *   wallet_address     — merchant's wallet (used to look up merchant ID)
 *   title, description, category, difficulty
 *   reward_amount, reward_token, estimated_duration_mins
 *   stops[]            — array of stop objects
 */
router.post("/trail/create", (req, res) => {
  const {
    wallet_address,
    title,
    description,
    category,
    difficulty = "easy",
    reward_amount,
    reward_token = "USDm",
    estimated_duration_mins,
    stops = [],
  } = req.body;

  if (!wallet_address || !title || !category || !reward_amount) {
    return res.status(400).json({ error: "wallet_address, title, category, and reward_amount are required" });
  }

  const merchant = db.prepare(`SELECT id FROM merchants WHERE wallet_address = ?`).get(wallet_address.toLowerCase());
  if (!merchant) {
    return res.status(404).json({ error: "Merchant not found. Please register first." });
  }

  if (!stops.length) {
    return res.status(400).json({ error: "A trail must have at least one stop" });
  }

  // Use a transaction so trail + stops are inserted atomically
  const createTrailTx = db.transaction(() => {
    const trailResult = db.prepare(`
      INSERT INTO trails (merchant_id, title, description, category, difficulty, reward_amount, reward_token, estimated_duration_mins, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(merchant.id, title, description ?? null, category, difficulty, reward_amount, reward_token, estimated_duration_mins ?? null);

    const trailId = trailResult.lastInsertRowid;

    const insertStop = db.prepare(`
      INSERT INTO stops (trail_id, title, description, latitude, longitude, order_index, challenge_type, challenge_payload, geofence_radius_m, xp_reward)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < stops.length; i++) {
      const s = stops[i];
      if (!s.latitude || !s.longitude || !s.title) {
        throw new Error(`Stop ${i + 1} is missing required fields (title, latitude, longitude)`);
      }
      insertStop.run(
        trailId,
        s.title,
        s.description ?? null,
        s.latitude,
        s.longitude,
        i,
        s.challenge_type ?? "qr",
        s.challenge_payload ?? null,
        s.geofence_radius_m ?? 50,
        s.xp_reward ?? 100
      );
    }

    return trailId;
  });

  try {
    const trailId = createTrailTx();
    res.status(201).json({
      success: true,
      trail_id: trailId,
      message: "Trail created successfully. Fund and activate it to make it visible to players.",
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/merchants/analytics/:merchant_id
 * Returns campaign performance stats for a merchant.
 */
router.get("/analytics/:merchant_id", (req, res) => {
  const merchantId = parseInt(req.params.merchant_id);

  const merchant = db.prepare(`SELECT * FROM merchants WHERE id = ?`).get(merchantId);
  if (!merchant) {
    return res.status(404).json({ error: "Merchant not found" });
  }

  const trails = db.prepare(`
    SELECT t.id, t.title, t.category, t.active, t.reward_amount, t.total_budget, t.remaining_budget,
      (SELECT COUNT(*) FROM trail_completions tc WHERE tc.trail_id = t.id) as completions,
      (SELECT COUNT(*) FROM stop_completions sc
       JOIN stops s ON sc.stop_id = s.id
       WHERE s.trail_id = t.id) as total_stop_visits,
      (SELECT COUNT(DISTINCT sc.user_address) FROM stop_completions sc
       JOIN stops s ON sc.stop_id = s.id
       WHERE s.trail_id = t.id) as unique_visitors
    FROM trails t
    WHERE t.merchant_id = ?
    ORDER BY t.created_at DESC
  `).all(merchantId);

  const summary = {
    total_trails: trails.length,
    active_trails: trails.filter((t) => t.active).length,
    total_completions: trails.reduce((sum, t) => sum + t.completions, 0),
    total_unique_visitors: trails.reduce((sum, t) => sum + t.unique_visitors, 0),
    total_budget_spent: trails.reduce((sum, t) => sum + (t.total_budget - t.remaining_budget), 0),
  };

  res.json({ merchant, summary, trails });
});

export default router;
