// ===================================================================
// Workload balancing engine
// This is a transparent, tunable rule-based scoring system (not a black-box
// ML model) - it's fast, explainable to a shop owner, and needs no training
// data. Each mechanic gets a load score; jobs get suggested/blocked based on it.
// ===================================================================


const WEIGHTS = {
  in_progress: 3,
  pending: 1.5,
  on_hold: 0.5,
};

const OVERLOAD_THRESHOLD = 9;
module.exports = { OVERLOAD_THRESHOLD };

function scoreForMechanic(shopId, mechanicId) {
  const jobs = db
    .prepare(`SELECT status FROM jobs WHERE shop_id = ? AND mechanic_id = ? AND status NOT IN ('completed','delivered')`)
    .all(shopId, mechanicId);

  let score = 0;
  const counts = { in_progress: 0, pending: 0, on_hold: 0 };
  for (const j of jobs) {
    if (WEIGHTS[j.status] !== undefined) {
      score += WEIGHTS[j.status];
      counts[j.status] = (counts[j.status] || 0) + 1;
    }
  }
  // Experience discount: seasoned mechanics can handle marginally more
  const mech = db.prepare('SELECT years_experience FROM mechanics WHERE id = ?').get(mechanicId);
  const experienceFactor = mech ? Math.max(0.75, 1 - Math.min(mech.years_experience, 10) * 0.02) : 1;
  score = score * experienceFactor;

  return {
    mechanicId,
    score: Math.round(score * 10) / 10,
    counts,
    overloaded: score >= OVERLOAD_THRESHOLD,
  };
}

function shopWorkloadReport(shopId) {
  const mechanics = db.prepare('SELECT id, name, mechanic_code FROM mechanics WHERE shop_id = ? AND active = 1').all(shopId);
  return mechanics
    .map((m) => ({ ...scoreForMechanic(shopId, m.id), name: m.name, mechanic_code: m.mechanic_code }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { scoreForMechanic, shopWorkloadReport, OVERLOAD_THRESHOLD };
