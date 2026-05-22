import express from "express";
import db from "../db.js";

const router = express.Router();

/**
 * Haversine formula — returns distance in meters between two GPS points.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /api/trails/nearby
 * Returns active trails sorted by distance from the provided GPS coordinates.
 *
 * Query params:
 *   lat       — player latitude (required)
 *   lng       — player longitude (required)
 *   radius_km — search radius in km (default: 10)
 */
router.get("/nearby", (req, res) => {
  const { lat, lng, radius_km = 10 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng are required" });
  }

  const playerLat = parseFloat(lat);
  const playerLng = parseFloat(lng);
  const radiusM = parseFloat(radius_km) * 1000;

  if (isNaN(playerLat) || isNaN(playerLng)) {
    return res.status(400).json({ error: "lat and lng must be valid numbers" });
  }

  // Fetch all active trails with their merchant info
  const trails = db
    .prepare(
      `
      SELECT
        t.id, t.title, t.description, t.category, t.difficulty,
        t.reward_amount, t.reward_token, t.estimated_duration_mins,
        t.remaining_budget, t.active,
        m.business_name as merchant_name, m.latitude as merchant_lat, m.longitude as merchant_lng,
        m.logo_url as merchant_logo,
        (SELECT COUNT(*) FROM stops s WHERE s.trail_id = t.id) as stop_count
      FROM trails t
      JOIN merchants m ON t.merchant_id = m.id
      WHERE t.active = 1 AND t.remaining_budget > 0
    `
    )
    .all();

  // Filter by distance and attach distance to each trail
  const nearby = trails
    .map((trail) => {
      const dist = haversineDistance(
        playerLat,
        playerLng,
        trail.merchant_lat,
        trail.merchant_lng
      );
      return { ...trail, distance_m: Math.round(dist) };
    })
    .filter((t) => t.distance_m <= radiusM)
    .sort((a, b) => a.distance_m - b.distance_m);

  res.json({ trails: nearby, count: nearby.length });
});

/**
 * GET /api/trails/:id
 * Returns full details of a trail including all stops.
 */
router.get("/:id", (req, res) => {
  const trailId = parseInt(req.params.id);

  const trail = db
    .prepare(
      `
      SELECT
        t.*, m.business_name as merchant_name, m.latitude as merchant_lat,
        m.longitude as merchant_lng, m.logo_url as merchant_logo,
        m.operating_hours, m.address as merchant_address
      FROM trails t
      JOIN merchants m ON t.merchant_id = m.id
      WHERE t.id = ?
    `
    )
    .get(trailId);

  if (!trail) {
    return res.status(404).json({ error: "Trail not found" });
  }

  // Fetch stops for this trail (include challenge_payload for frontend client and trivia parsing)
  const stops = db
    .prepare(
      `
      SELECT id, title, description, latitude, longitude, order_index,
             challenge_type, challenge_payload, geofence_radius_m, xp_reward
      FROM stops
      WHERE trail_id = ?
      ORDER BY order_index ASC
    `
    )
    .all(trailId);

  res.json({ trail: { ...trail, stops } });
});

/**
 * POST /api/stop/verify
 * Verifies that a player is at a stop's location and completed the challenge.
 *
 * Body:
 *   user_address   — player's wallet address
 *   stop_id        — the stop being verified
 *   latitude       — player's current GPS latitude
 *   longitude      — player's current GPS longitude
 *   challenge_type — "qr" | "trivia" | "code"
 *   challenge_answer — the player's answer/scanned value
 */
router.post("/verify", (req, res) => {
  const { user_address, stop_id, latitude, longitude, challenge_answer } = req.body;

  if (!user_address || !stop_id || latitude == null || longitude == null || !challenge_answer) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate basic address format
  if (!/^0x[0-9a-fA-F]{40}$/.test(user_address)) {
    return res.status(400).json({ error: "Invalid wallet address format" });
  }

  const stop = db
    .prepare(`SELECT * FROM stops WHERE id = ?`)
    .get(parseInt(stop_id));

  if (!stop) {
    return res.status(404).json({ error: "Stop not found" });
  }

  // Check if already completed
  const alreadyDone = db
    .prepare(`SELECT id FROM stop_completions WHERE user_address = ? AND stop_id = ?`)
    .get(user_address.toLowerCase(), stop.id);

  if (alreadyDone) {
    return res.status(409).json({ error: "Stop already completed" });
  }

  // Verify GPS — player must be within the geofence radius
  const dist = haversineDistance(
    parseFloat(latitude),
    parseFloat(longitude),
    stop.latitude,
    stop.longitude
  );

  if (dist > stop.geofence_radius_m) {
    return res.status(400).json({
      error: "Too far from stop location",
      distance_m: Math.round(dist),
      required_m: stop.geofence_radius_m,
    });
  }

  // Verify challenge answer
  let challengeValid = false;

  if (stop.challenge_type === "qr" || stop.challenge_type === "code") {
    // QR and code challenges: exact string match
    challengeValid = challenge_answer.trim() === stop.challenge_payload;
  } else if (stop.challenge_type === "trivia") {
    // Trivia: parse payload JSON and compare answer
    try {
      const payload = JSON.parse(stop.challenge_payload);
      challengeValid = challenge_answer.trim() === payload.answer;
    } catch {
      return res.status(500).json({ error: "Invalid stop challenge configuration" });
    }
  }

  if (!challengeValid) {
    return res.status(400).json({ error: "Incorrect challenge answer" });
  }

  // Record stop completion
  db.prepare(
    `INSERT INTO stop_completions (user_address, stop_id, trail_id) VALUES (?, ?, ?)`
  ).run(user_address.toLowerCase(), stop.id, stop.trail_id);

  // Award XP to the user
  db.prepare(
    `INSERT INTO users (wallet_address, xp) VALUES (?, ?)
     ON CONFLICT(wallet_address) DO UPDATE SET xp = xp + excluded.xp`
  ).run(user_address.toLowerCase(), stop.xp_reward);

  // Check if all stops in this trail are now complete
  const totalStops = db
    .prepare(`SELECT COUNT(*) as c FROM stops WHERE trail_id = ?`)
    .get(stop.trail_id).c;

  const completedStops = db
    .prepare(
      `SELECT COUNT(*) as c FROM stop_completions WHERE user_address = ? AND trail_id = ?`
    )
    .get(user_address.toLowerCase(), stop.trail_id).c;

  const trailComplete = completedStops >= totalStops;

  res.json({
    success: true,
    xp_earned: stop.xp_reward,
    trail_complete: trailComplete,
    stops_completed: completedStops,
    stops_total: totalStops,
  });
});

export default router;
