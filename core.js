// I want to… — shared logic (no DOM). Loaded by the app and by the notification job in the data repo.
// Two people each swipe yes / maybe / no on each other's ideas (and on a few suggestions from the built-in bank).

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const nowIso = () => new Date().toISOString();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emptyData() {
  return { version: 1, people: {}, categories: [], ideas: [], votes: {}, devices: {}, meta: {}, nudges: [], notify: { matched: [], announced: [], asks: [], nudges: [] } };
}

/* ---------- categories ---------- */
// Starter set, always present. Custom ones live in data.categories.
const STARTER_CATS = [
  { id: 'date', name: 'Date nights', emoji: '🍷', bg: '#fbe4e6', fg: '#9b1c3a' },
  { id: 'days', name: 'Days out', emoji: '🎡', bg: '#fdecd6', fg: '#9a4a07' },
  { id: 'trips', name: 'Trips & holidays', emoji: '✈️', bg: '#dff0fb', fg: '#155a8a' },
  { id: 'food', name: 'Food & drink', emoji: '🍝', bg: '#fff3c4', fg: '#7a5800' },
  { id: 'home', name: 'Home & garden', emoji: '🏡', bg: '#e3f3e4', fg: '#1d6b33' },
  { id: 'family', name: 'Family', emoji: '👨‍👩‍👧‍👦', bg: '#ece6fb', fg: '#5631a8' },
  { id: 'spicy', name: 'Spicy', emoji: '🔥', bg: '#ffe1d6', fg: '#b3261e', discreet: true },   // never shown on the lock screen
];
const CUSTOM_COLOURS = [['#e5eef0', '#2c5d68'], ['#f6e7f4', '#83306f'], ['#eceee4', '#4f5a26'], ['#f3e9e1', '#7a4a2a'], ['#e6e9f7', '#3a4a8f']];
function allCats(data) {
  const custom = (data.categories || []).filter(c => !c.deleted).map((c, i) => {
    const [bg, fg] = CUSTOM_COLOURS[i % CUSTOM_COLOURS.length];
    return { bg, fg, ...c, custom: true };
  });
  return [...STARTER_CATS, ...custom];
}
function catOf(data, id) {
  return allCats(data).find(c => c.id === id) || (data.categories || []).find(c => c.id === id) || { id, name: 'Other', emoji: '✨', bg: '#eceae4', fg: '#55524a' };
}

/* ---------- people ---------- */
const peopleList = data => Object.values(data.people || {}).filter(p => !p.gone).sort((a, b) => (a.joinedAt || '') < (b.joinedAt || '') ? -1 : 1);
function partnerOf(data, me) { return peopleList(data).find(p => p.id !== me) || null; }
const nameOf = (data, pid) => (data.people[pid] && data.people[pid].name) || 'Someone';

/* ---------- votes & status ---------- */
const voteKey = (ideaId, pid) => `${ideaId}:${pid}`;
// The vote a person has on an idea. Adding an idea counts as your yes.
function voteRec(data, idea, pid) {
  const r = data.votes[voteKey(idea.id, pid)];
  if (r && r.v) return r;
  if (idea.by === pid) return { v: 'yes', at: idea.addedAt, implicit: true };
  return null;
}
const voteOf = (data, idea, pid) => (voteRec(data, idea, pid) || {}).v || null;
// "Ask again": the other person sees the card once more until they've swiped it after the ask.
function askPendingFor(data, idea, pid) {
  if (!idea.ask || idea.ask.to !== pid) return false;
  const r = data.votes[voteKey(idea.id, pid)];
  return !r || !r.v || (r.at || '') < idea.ask.at;
}
const liveIdeas = data => data.ideas.filter(i => !i.deleted);

// Where an idea sits for "me": match | maybe | no | waiting | done
function statusOf(data, idea, me) {
  if (idea.done) return { s: 'done' };
  const partner = partnerOf(data, me);
  const pid = partner && partner.id;
  const vm = voteOf(data, idea, me), vp = pid ? voteOf(data, idea, pid) : null;
  if (pid && askPendingFor(data, idea, pid)) return { s: 'waiting', on: [pid], asked: true, vm, vp };
  if (askPendingFor(data, idea, me)) return { s: 'waiting', on: [me], asked: true, vm, vp };
  if (vm === 'no' || vp === 'no') return { s: 'no', vm, vp, noBy: [vm === 'no' && me, vp === 'no' && pid].filter(Boolean) };
  if (vm && vp) return { s: vm === 'yes' && vp === 'yes' ? 'match' : 'maybe', vm, vp };
  return { s: 'waiting', on: [!vm && me, pid ? !vp && pid : 'partner'].filter(Boolean), vm, vp };
}
// Can I send this back to my partner once more?
function canAskAgain(data, idea, me) {
  const partner = partnerOf(data, me); if (!partner || idea.done) return false;
  const st = statusOf(data, idea, me);
  return st.s === 'no' && st.vp === 'no' && st.vm !== 'no' && !(idea.asked || []).includes(me);
}

// Cards for me to swipe, optionally limited to one category. Asked-again cards first, then oldest first.
function deckFor(data, me, cat) {
  return liveIdeas(data).filter(i => !i.done && i.by !== me && (!cat || cat === 'all' || i.cat === cat))
    .filter(i => askPendingFor(data, i, me) || !voteOf(data, i, me))
    .sort((a, b) => {
      const pa = askPendingFor(data, a, me) ? 0 : 1, pb = askPendingFor(data, b, me) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.addedAt || '') < (b.addedAt || '') ? -1 : 1;
    });
}

/* ---------- merge two copies (newest edit wins per item) ---------- */
function newestBy(list, key, stamp) {
  const m = new Map();
  for (const x of list) { if (!x) continue; const c = m.get(x[key]); if (!c || (x[stamp] || '') > (c[stamp] || '')) m.set(x[key], x); }
  return m;
}
function merge(a, b) {
  a = Object.assign(emptyData(), a); b = Object.assign(emptyData(), b);
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const votes = {};
  for (const [k, v] of [...Object.entries(a.votes), ...Object.entries(b.votes)]) if (!votes[k] || (v.at || '') > (votes[k].at || '')) votes[k] = v;
  const meta = { ...a.meta };
  for (const [k, v] of Object.entries(b.meta)) if (!(k in meta) || String(v) > String(meta[k])) meta[k] = v;
  const uni = k => [...new Set([...(a.notify[k] || []), ...(b.notify[k] || [])])].sort().slice(-2000);
  const sortObj = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  return {
    version: 1,
    people: sortObj(Object.fromEntries(newestBy([...Object.values(a.people), ...Object.values(b.people)], 'id', 'updatedAt'))),
    categories: [...newestBy([...a.categories, ...b.categories], 'id', 'updatedAt').values()].sort((x, y) => (x.addedAt || '') < (y.addedAt || '') ? -1 : 1),
    ideas: [...newestBy([...a.ideas, ...b.ideas], 'id', 'updatedAt').values()].filter(i => !(i.deleted && i.updatedAt < cutoff)).sort((x, y) => x.id < y.id ? -1 : 1),
    votes: sortObj(votes),
    devices: sortObj(Object.fromEntries([...newestBy([...Object.values(a.devices), ...Object.values(b.devices)], 'id', 'updatedAt')].filter(([, d]) => !(d.gone && d.updatedAt < cutoff)))),
    meta: sortObj(meta),
    // Nudges ("I've played" / "I've added"): kept for a week, then dropped.
    nudges: [...newestBy([...(a.nudges || []), ...(b.nudges || [])], 'id', 'at').values()].filter(n => n.at > new Date(Date.now() - 7 * 86400000).toISOString()).sort((x, y) => x.at < y.at ? -1 : 1),
    notify: { matched: uni('matched'), announced: uni('announced'), asks: uni('asks'), nudges: uni('nudges') },
  };
}

function makeIdea({ text, cat, by = null, src = 'user' }) {
  const now = nowIso();
  return { id: uid(), text: String(text).trim(), cat, by, src, addedAt: now, updatedAt: now };
}
// "go wild swimming" → "Go wild swimming"; strips a typed "I want to" so it isn't doubled.
function tidyText(t) {
  let s = String(t || '').trim().replace(/^i\s+want\s+to\s*(…|\.\.\.)?\s*/i, '').replace(/\s+/g, ' ').replace(/[.]+$/, '');
  // Lower-case a leading verb ("Go swimming" → "go swimming") but leave names alone ("Paris" stays).
  return /^[A-Z][a-z]+\b/.test(s) && /^(go|see|try|visit|learn|make|take|have|do|book|build|plant|cook|eat|watch|get|start|paint|walk|climb|swim|ride|stay|spend|find|join|bake|grow|fix|redo|sort|throw|camp|hike|explore|plan|teach|play|write|read|run|dance|sleep|drive|fly|sail|kayak|ski|surf|swap|host|throw|re|put|buy|hire)\b/i.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

if (typeof module !== 'undefined') module.exports = { emptyData, STARTER_CATS, allCats, catOf, peopleList, partnerOf, nameOf, voteKey, voteRec, voteOf, askPendingFor, liveIdeas, statusOf, canAskAgain, deckFor, merge, makeIdea, tidyText, uid, nowIso, todayStr, esc };
