const REVIEWS_KEY = 'la-reviews'

/* SM-2 spaced repetition scheduler.
   Each review card: { subject, mainTitle, subTitle, item, ease, interval, reps, nextReview (ms), lastReview (ms), dueToday } */
export function loadReviews() {
  try {
    const r = JSON.parse(localStorage.getItem(REVIEWS_KEY))
    return r && typeof r === 'object' ? r : {}
  } catch {
    return {}
  }
}

function saveReviews(map) {
  try { localStorage.setItem(REVIEWS_KEY, JSON.stringify(map)) } catch { /* ignore */ }
}

export function dayStart(offset = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

/* Called when a lesson is first marked done: seed a review card due tomorrow. */
export function seedReview({ subject, mainTitle, subTitle, item }) {
  const key = `${mainTitle}::${subTitle}::${item}`
  const map = loadReviews()
  if (map[key]) return map[key]
  const card = {
    key,
    subject,
    mainTitle,
    subTitle,
    item,
    ease: 2.5,
    interval: 1,
    reps: 0,
    nextReview: dayStart(1),
    lastReview: null
  }
  map[key] = card
  saveReviews(map)
  return card
}

/* Remove the card (lesson reset to todo, or deleted). */
export function dropReview({ mainTitle, subTitle, item }) {
  const key = `${mainTitle}::${subTitle}::${item}`
  const map = loadReviews()
  delete map[key]
  saveReviews(map)
}

/* SM-2 update. quality 0-5. Returns the updated card. */
export function updateReview({ mainTitle, subTitle, item }, quality) {
  const key = `${mainTitle}::${subTitle}::${item}`
  const q = Math.max(0, Math.min(5, Math.round(+quality || 0)))
  const map = loadReviews()
  const cur = map[key] || { key, mainTitle, subTitle, item, subject: '', ease: 2.5, interval: 1, reps: 0 }
  let { ease, interval, reps } = cur
  if (q >= 3) {
    if (reps === 0) interval = 1
    else if (reps === 1) interval = 6
    else interval = Math.round(interval * ease)
    reps += 1
  } else {
    reps = 0
    interval = 1
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  const next = {
    ...cur,
    ease: Math.round(ease * 100) / 100,
    interval,
    reps,
    nextReview: dayStart(Math.max(1, interval)),
    lastReview: Date.now()
  }
  map[key] = next
  saveReviews(map)
  return next
}

export function getDueReviews() {
  const now = Date.now()
  return Object.values(loadReviews())
    .filter((c) => c.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview)
}

export function getAllReviews() {
  return Object.values(loadReviews())
}

export function reviewStats() {
  const all = getAllReviews()
  const due = all.filter((c) => c.nextReview <= Date.now())
  const mature = all.filter((c) => c.interval >= 21)
  return { total: all.length, due: due.length, mature: mature.length }
}
