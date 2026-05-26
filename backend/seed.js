/**
 * Seed Script — Populates the GeoQuest database with test merchants, trails, and stops.
 * Coordinates are centered around Lagos Island, Lagos, Nigeria.
 * Run with: node backend/seed.js
 */

import db from "./db.js";

function seed() {
  console.log("🌱 Seeding GeoQuest database...");

  // Clear existing data in correct dependency order
  db.exec(`
    DELETE FROM stop_completions;
    DELETE FROM trail_completions;
    DELETE FROM used_nonces;
    DELETE FROM stops;
    DELETE FROM trails;
    DELETE FROM merchants;
    DELETE FROM users;
  `);

  // ─── Merchants ─────────────────────────────────────────────────────────────
  const insertMerchant = db.prepare(`
    INSERT INTO merchants (business_name, wallet_address, category, address, latitude, longitude, operating_hours, logo_url, verified)
    VALUES (@business_name, @wallet_address, @category, @address, @latitude, @longitude, @operating_hours, @logo_url, @verified)
  `);

  const merchants = [
    {
      business_name: "Terra Kulture",
      wallet_address: "0x1111111111111111111111111111111111111111",
      category: "Art & Culture",
      address: "1376 Tiamiyu Savage St, Lagos Island",
      latitude: 6.4314,
      longitude: 3.4144,
      operating_hours: "Mon-Sat 9am-7pm",
      logo_url: "https://placehold.co/100x100?text=TK",
      verified: 1,
    },
    {
      business_name: "Bogobiri House",
      wallet_address: "0x2222222222222222222222222222222222222222",
      category: "Restaurant & Bar",
      address: "9 Maitama Sule St, Ikoyi",
      latitude: 6.4488,
      longitude: 3.4396,
      operating_hours: "Daily 12pm-11pm",
      logo_url: "https://placehold.co/100x100?text=BH",
      verified: 1,
    },
    {
      business_name: "Nike Art Gallery",
      wallet_address: "0x3333333333333333333333333333333333333333",
      category: "Art & Culture",
      address: "2 Elegushi Beach Rd, Lekki Phase 1",
      latitude: 6.4344,
      longitude: 3.4794,
      operating_hours: "Mon-Sat 9am-6pm",
      logo_url: "https://placehold.co/100x100?text=NAG",
      verified: 1,
    },
    {
      business_name: "The Yellow Chilli",
      wallet_address: "0x4444444444444444444444444444444444444444",
      category: "Restaurant",
      address: "Victoria Island, Lagos",
      latitude: 6.4294,
      longitude: 3.4201,
      operating_hours: "Daily 11am-10pm",
      logo_url: "https://placehold.co/100x100?text=YC",
      verified: 1,
    },
    {
      business_name: "Jazzhole Records",
      wallet_address: "0x5555555555555555555555555555555555555555",
      category: "Music & Records",
      address: "168 Awolowo Rd, Ikoyi",
      latitude: 6.4503,
      longitude: 3.4231,
      operating_hours: "Mon-Sat 10am-7pm",
      logo_url: "https://placehold.co/100x100?text=JR",
      verified: 1,
    },
  ];

  const merchantIds = {};
  for (const m of merchants) {
    const result = insertMerchant.run(m);
    merchantIds[m.business_name] = result.lastInsertRowid;
  }
  console.log(`  ✓ Inserted ${merchants.length} merchants`);

  // ─── Trails ────────────────────────────────────────────────────────────────
  const insertTrail = db.prepare(`
    INSERT INTO trails (merchant_id, title, description, category, difficulty, reward_amount, reward_token, estimated_duration_mins, total_budget, remaining_budget, active, on_chain_trail_id)
    VALUES (@merchant_id, @title, @description, @category, @difficulty, @reward_amount, @reward_token, @estimated_duration_mins, @total_budget, @remaining_budget, @active, @on_chain_trail_id)
  `);

  const trails = [
    {
      merchant_id: merchantIds["Terra Kulture"],
      title: "Lagos Art & Soul Trail",
      description: "Explore the vibrant art scene of Lagos Island — from contemporary galleries to live music venues.",
      category: "Art & Culture",
      difficulty: "easy",
      reward_amount: 0.5,
      reward_token: "USDm",
      estimated_duration_mins: 90,
      total_budget: 50,
      remaining_budget: 50,
      active: 1,
      on_chain_trail_id: 0,
    },
    {
      merchant_id: merchantIds["Bogobiri House"],
      title: "Ikoyi Foodie Quest",
      description: "Discover the best restaurants and hidden dining gems tucked away in the leafy streets of Ikoyi.",
      category: "Food & Drink",
      difficulty: "medium",
      reward_amount: 0.75,
      reward_token: "USDm",
      estimated_duration_mins: 120,
      total_budget: 75,
      remaining_budget: 75,
      active: 1,
      on_chain_trail_id: 1,
    },
    {
      merchant_id: merchantIds["Jazzhole Records"],
      title: "Lagos Music History Walk",
      description: "A guided audio and physical tour of Lagos's legendary music venues, record shops, and cultural landmarks.",
      category: "Music",
      difficulty: "easy",
      reward_amount: 0.5,
      reward_token: "USDm",
      estimated_duration_mins: 60,
      total_budget: 40,
      remaining_budget: 40,
      active: 1,
      on_chain_trail_id: 2,
    },
  ];

  const trailIds = {};
  for (const t of trails) {
    const result = insertTrail.run(t);
    trailIds[t.title] = result.lastInsertRowid;
  }
  console.log(`  ✓ Inserted ${trails.length} trails`);

  // ─── Stops ─────────────────────────────────────────────────────────────────
  const insertStop = db.prepare(`
    INSERT INTO stops (trail_id, title, description, latitude, longitude, order_index, challenge_type, challenge_payload, geofence_radius_m, xp_reward)
    VALUES (@trail_id, @title, @description, @latitude, @longitude, @order_index, @challenge_type, @challenge_payload, @geofence_radius_m, @xp_reward)
  `);

  const stops = [
    // Trail 1: Lagos Art & Soul Trail
    {
      trail_id: trailIds["Lagos Art & Soul Trail"],
      title: "Terra Kulture Gallery",
      description: "Start at Terra Kulture, one of Lagos's premier arts and culture spaces. Scan the QR code at the front desk.",
      latitude: 6.4314,
      longitude: 3.4144,
      order_index: 0,
      challenge_type: "qr",
      challenge_payload: "TERRA_KULTURE_STOP_1",
      geofence_radius_m: 50,
      xp_reward: 100,
    },
    {
      trail_id: trailIds["Lagos Art & Soul Trail"],
      title: "Nike Art Gallery",
      description: "Visit the iconic Nike Art Gallery. Answer the trivia question about the artwork on display.",
      latitude: 6.4344,
      longitude: 3.4794,
      order_index: 1,
      challenge_type: "trivia",
      challenge_payload: JSON.stringify({
        question: "What year was Nike Art Gallery founded?",
        options: ["1983", "1993", "2003", "1973"],
        answer: "1983",
      }),
      geofence_radius_m: 50,
      xp_reward: 150,
    },
    {
      trail_id: trailIds["Lagos Art & Soul Trail"],
      title: "Bogobiri House",
      description: "End your art journey at Bogobiri House, a cultural hub and boutique hotel. Enter the secret code found on the chalkboard outside.",
      latitude: 6.4488,
      longitude: 3.4396,
      order_index: 2,
      challenge_type: "code",
      challenge_payload: "BOGOBIRI2025",
      geofence_radius_m: 50,
      xp_reward: 200,
    },

    // Trail 2: Ikoyi Foodie Quest
    {
      trail_id: trailIds["Ikoyi Foodie Quest"],
      title: "The Yellow Chilli",
      description: "Start at The Yellow Chilli for a taste of authentic Nigerian cuisine. Scan the QR at your table.",
      latitude: 6.4294,
      longitude: 3.4201,
      order_index: 0,
      challenge_type: "qr",
      challenge_payload: "YELLOW_CHILLI_STOP_1",
      geofence_radius_m: 50,
      xp_reward: 100,
    },
    {
      trail_id: trailIds["Ikoyi Foodie Quest"],
      title: "Bogobiri House Restaurant",
      description: "Swing by Bogobiri's acclaimed restaurant. Answer: what is their signature cocktail called?",
      latitude: 6.4488,
      longitude: 3.4396,
      order_index: 1,
      challenge_type: "trivia",
      challenge_payload: JSON.stringify({
        question: "What is the name of Bogobiri's signature house cocktail?",
        options: ["Lagos Sling", "Island Breeze", "Bogobiri Special", "Ikoyi Sunset"],
        answer: "Bogobiri Special",
      }),
      geofence_radius_m: 50,
      xp_reward: 150,
    },

    // Trail 3: Lagos Music History Walk
    {
      trail_id: trailIds["Lagos Music History Walk"],
      title: "Jazzhole Records",
      description: "Begin at Jazzhole, the legendary independent record shop on Awolowo Road. Scan the QR at the entrance.",
      latitude: 6.4503,
      longitude: 3.4231,
      order_index: 0,
      challenge_type: "qr",
      challenge_payload: "JAZZHOLE_STOP_1",
      geofence_radius_m: 50,
      xp_reward: 100,
    },
    {
      trail_id: trailIds["Lagos Music History Walk"],
      title: "Terra Kulture Live Stage",
      description: "Head to Terra Kulture's performance stage — home of legendary Lagos live music. Enter the week's code displayed on the marquee.",
      latitude: 6.4314,
      longitude: 3.4144,
      order_index: 1,
      challenge_type: "code",
      challenge_payload: "TERRA_LIVE_2025",
      geofence_radius_m: 50,
      xp_reward: 150,
    },
  ];

  for (const s of stops) {
    insertStop.run(s);
  }
  console.log(`  ✓ Inserted ${stops.length} stops`);

  // ─── Test Users ────────────────────────────────────────────────────────────
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (wallet_address, username, xp, level, streak_days)
    VALUES (@wallet_address, @username, @xp, @level, @streak_days)
  `);

  const users = [
    { wallet_address: "0xaaaa000000000000000000000000000000000001", username: "Explorer_Chidi", xp: 1200, level: 5, streak_days: 7 },
    { wallet_address: "0xaaaa000000000000000000000000000000000002", username: "Lagos_Walker", xp: 800, level: 3, streak_days: 3 },
    { wallet_address: "0xaaaa000000000000000000000000000000000003", username: "QuestHunter_Amara", xp: 550, level: 2, streak_days: 1 },
  ];

  for (const u of users) {
    insertUser.run(u);
  }
  console.log(`  ✓ Inserted ${users.length} test users`);

  console.log("\n✅ Seed complete. GeoQuest database is ready.");
}

// Export for programmatic use (e.g., reset DB endpoint)
export { seed as runSeed };

// Run automatically only if executed directly
if (process.argv[1] && (process.argv[1].endsWith("seed.js") || process.argv[1].endsWith("seed"))) {
  seed();
}
