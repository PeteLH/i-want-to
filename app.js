/* I want to… — the app. Data is one JSON file in a private GitHub repo, shared by both phones (same approach as Larder). */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const KEY_CFG = 'iwt.cfg', KEY_DATA = 'iwt.data';
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const ICON_TICK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6"/></svg>';

let cfg = Object.assign({ branch: 'main', path: 'ideas.json' }, window.IWT_DEFAULTS || {}, JSON.parse(localStorage.getItem(KEY_CFG) || '{}'));
let data = loadLocal();
function loadLocal() { try { return Object.assign(emptyData(), JSON.parse(localStorage.getItem(KEY_DATA) || '{}')); } catch { return emptyData(); } }
function saveLocal() { localStorage.setItem(KEY_DATA, JSON.stringify(data)); }
function saveCfg() { localStorage.setItem(KEY_CFG, JSON.stringify(cfg)); }
const configured = () => !!(cfg.owner && cfg.repo && cfg.token);
const me = () => cfg.person || null;
const myName = () => (me() && data.people[me()] && data.people[me()].name) || '';
const partner = () => me() ? partnerOf(data, me()) : null;
const partnerName = () => (partner() || {}).name || 'your partner';
const byId = id => data.ideas.find(i => i.id === id);
const hidden = i => cfg.hideSpicy && i.cat === 'spicy';
const visibleIdeas = () => liveIdeas(data).filter(i => !hidden(i));
const visibleCats = () => allCats(data).filter(c => !(cfg.hideSpicy && c.id === 'spicy'));
const myDeck = (cat = 'all') => me() ? deckFor(data, me(), cat).filter(i => !hidden(i)) : [];
function ago(iso) {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : d < 60 ? `${Math.round(d / 7)} week${Math.round(d / 7) === 1 ? '' : 's'} ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
const tile = (cat, size = '') => `<div class="tile" style="background:${cat.bg};color:${cat.fg}${size}">${cat.emoji}</div>`;
const VWORD = { yes: 'Yes', maybe: 'Maybe', no: 'No' };
const VEMOJI = { yes: '👍', maybe: '🤔', no: '👎' };

/* ---------- screens ---------- */
let screen = 'play', lastTab = 'play';
function show(name, { noHistory } = {}) {
  if (['play', 'add', 'list'].includes(name)) lastTab = name;
  screen = name;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === 'screen-' + name));
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.body.classList.toggle('noNav', name === 'welcome' || name === 'settings');
  if (!noHistory && name === 'settings') history.pushState({ s: name }, '');
  render();
  window.scrollTo(0, 0);
  if (name === 'add') setTimeout(() => $('#add-text').focus(), 120);
}
window.addEventListener('popstate', () => { if ($('#sheet').open) { $('#sheet').close(); return; } if (screen === 'settings') show(lastTab, { noHistory: true }); });
$$('.nav button').forEach(b => b.onclick = () => show(b.dataset.tab));
$$('[data-back]').forEach(b => b.onclick = () => history.back());
$('#avatarBtn').onclick = () => show('settings');

function render() {
  $('#avatarBtn').textContent = (myName() || '?').slice(0, 1).toUpperCase();
  const deckN = myDeck().length;
  $('#badge-play').hidden = !deckN; $('#badge-play').textContent = deckN;
  const newMatches = matchesFor().filter(i => !seenMatches().includes(i.id)).length;
  $('#badge-list').hidden = !newMatches || screen === 'list'; $('#badge-list').textContent = newMatches;
  if (screen === 'play') renderPlay();
  else if (screen === 'add') renderAdd();
  else if (screen === 'list') renderList();
  else if (screen === 'settings') renderSettings();
  else if (screen === 'welcome') renderWelcome();
}
const matchesFor = () => me() ? visibleIdeas().filter(i => statusOf(data, i, me()).s === 'match') : [];
const seenMatches = () => JSON.parse(localStorage.getItem('iwt.seenMatches') || '[]');

/* ---------- category chips ---------- */
function chipsHtml(cats, active, counts, extra = '') {
  return cats.map(c => `<button class="chip ${active === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${c.emoji ? `<span>${c.emoji}</span>` : ''}${esc(c.name)}${counts && counts[c.id] != null ? ` <span class="n">${counts[c.id]}</span>` : ''}</button>`).join('') + extra;
}

/* ================= PLAY ================= */
let playCat = 'all', swipeHistory = [], animating = false;
function renderPlay() {
  const all = myDeck();
  const counts = { all: all.length };
  for (const i of all) counts[i.cat] = (counts[i.cat] || 0) + 1;
  if (playCat !== 'all' && !counts[playCat]) playCat = 'all';
  const cats = [{ id: 'all', name: 'All', emoji: '' }, ...visibleCats().filter(c => counts[c.id])];
  $('#play-cats').innerHTML = cats.length > 2 ? chipsHtml(cats, playCat, counts) : '';
  $$('#play-cats .chip').forEach(b => b.onclick = () => { playCat = b.dataset.cat; renderPlay(); });
  const deck = myDeck(playCat);
  $('#play-kicker').textContent = deck.length ? `${deck.length} to swipe` : 'Play';
  $('#b-undo').style.visibility = swipeHistory.length ? 'visible' : 'hidden';
  const empty = !deck.length;
  $('#deck-empty').hidden = !empty; $('#swipe-btns').style.visibility = empty ? 'hidden' : 'visible';
  $('#swipe-hint').hidden = empty || localStorage.getItem('iwt.swiped') === '1';
  if (empty) { $('#deck').innerHTML = ''; renderEmptyDeck(); return; }
  $('#deck').innerHTML = deck.slice(0, 3).map((i, n) => cardHtml(i, n)).reverse().join('');
  $$('#deck .pcard').forEach(fitCardText);
  attachDrag($('#deck .pcard.topcard'));
}
// Long ideas: shrink the text until it fits the card, so nobody has to scroll.
function fitCardText(card) {
  const body = card.querySelector('.pc-body'), t = card.querySelector('.pc-text');
  if (!body || !t || !body.clientHeight) return;
  let size = parseFloat(getComputedStyle(t).fontSize);
  while (body.scrollHeight > body.clientHeight + 1 && size > 15) { size -= 2; t.style.fontSize = size + 'px'; }
}
window.addEventListener('resize', () => { if (screen === 'play') $$('#deck .pcard').forEach(c => { const t = c.querySelector('.pc-text'); if (t) t.style.fontSize = ''; fitCardText(c); }); });
// The Add box: shrink the font as the idea gets longer, then let the box grow, so it never scrolls inside.
function fitAddText() {
  const ta = $('#add-text'), len = ta.value.length;
  ta.style.fontSize = (len > 90 ? 18 : len > 60 ? 21 : len > 35 ? 23 : 26) + 'px';
  ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px';
}
$('#add-text').addEventListener('input', fitAddText);
function cardHtml(i, n) {
  const c = catOf(data, i.cat), ask = askPendingFor(data, i, me());
  return `<div class="pcard ${n === 0 ? 'topcard' : n === 1 ? 'behind' : 'behind2'}" data-id="${i.id}">
    <div class="pc-top" style="background:${c.bg};color:${c.fg}"><span class="em">${c.emoji}</span>${esc(c.name)}</div>
    <div class="pc-body"><div class="pc-iwt">I want to…</div><div class="pc-text hd">${esc(i.text)}</div></div>
    ${ask ? `<div class="pc-ask"><b>${esc(nameOf(data, i.ask.from))} asked again</b>${i.ask.note ? `: “${esc(i.ask.note)}”` : ''}</div>` : ''}
    <div class="pc-foot">Added by ${esc(i.by ? nameOf(data, i.by) : 'someone')} · ${ago(i.addedAt)}</div>
    <div class="stamp s-yes">YES</div><div class="stamp s-no">NO</div><div class="stamp s-maybe">MAYBE</div>
  </div>`;
}
function renderEmptyDeck() {
  const el = $('#deck-empty');
  if (!configured() || !me()) { el.innerHTML = `<div class="em">👋</div><h2 class="hd">Not set up yet</h2><p>Connect this phone first.</p><button class="btn" id="e-setup">Set up</button>`; $('#e-setup').onclick = () => show('welcome'); return; }
  const p = partner();
  const waiting = visibleIdeas().filter(i => { const s = statusOf(data, i, me()); return s.s === 'waiting' && p && s.on.includes(p.id); }).length;
  const mine = visibleIdeas().filter(i => i.by === me()).length;
  if (!p) el.innerHTML = `<div class="em">💌</div><h2 class="hd">Waiting for your other half</h2><p>Send them the setup link from Settings. Meanwhile, add a few things you want to do.</p><button class="btn" id="e-add">Add an idea</button>`;
  else if (!mine && !visibleIdeas().length) el.innerHTML = `<div class="em">✨</div><h2 class="hd">Nothing here yet</h2><p>Add a few things you'd love to do. ${esc(p.name)} will swipe on them.</p><button class="btn" id="e-add">Add an idea</button>`;
  else el.innerHTML = `<div class="em">🎉</div><h2 class="hd">All caught up</h2><p>${waiting ? `${waiting} idea${waiting === 1 ? ' is' : 's are'} waiting on ${esc(p.name)}.` : `Nothing new from ${esc(p.name)} yet.`} Add some more of your own?</p><button class="btn" id="e-add">Add an idea</button> <button class="linkbtn" id="e-list">See the list</button>`;
  if (p) { el.insertAdjacentHTML('beforeend', `<div style="width:100%;max-width:360px">${nudgeHtml('played')}</div>`); bindNudges('#deck-empty'); }
  $('#e-add') && ($('#e-add').onclick = () => show('add'));
  $('#e-list') && ($('#e-list').onclick = () => show('list'));
}

// Drag the top card: right = yes, left = no, up = maybe.
function attachDrag(el) {
  if (!el) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false;
  const st = k => el.querySelector('.s-' + k);
  el.addEventListener('pointerdown', e => { if (animating) return; down = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); el.classList.remove('back'); });
  el.addEventListener('pointermove', e => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    el.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    const up = -dy > Math.abs(dx) ? Math.min(1, -dy / 110) : 0;
    st('yes').style.opacity = !up && dx > 0 ? Math.min(1, dx / 100) : 0;
    st('no').style.opacity = !up && dx < 0 ? Math.min(1, -dx / 100) : 0;
    st('maybe').style.opacity = up;
  });
  const end = () => {
    if (!down) return; down = false;
    if (-dy > 110 && -dy > Math.abs(dx)) return swipe('maybe');
    if (dx > 100) return swipe('yes');
    if (dx < -100) return swipe('no');
    el.classList.add('back'); el.style.transform = ''; ['yes', 'no', 'maybe'].forEach(k => st(k).style.opacity = 0);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function swipe(v) {
  const el = $('#deck .pcard.topcard'); if (!el || animating) return;
  const idea = byId(el.dataset.id); if (!idea) return;
  animating = true;
  el.querySelector('.s-' + v).style.opacity = 1;
  el.classList.add('fly');
  el.style.transform = v === 'yes' ? 'translate(140%,30px) rotate(24deg)' : v === 'no' ? 'translate(-140%,30px) rotate(-24deg)' : 'translate(0,-130%)';
  el.style.opacity = 0;
  const key = voteKey(idea.id, me());
  swipeHistory.push({ key, prev: data.votes[key] || null, askWasPending: askPendingFor(data, idea, me()) });
  if (swipeHistory.length > 20) swipeHistory.shift();
  setVote(idea, v);
  localStorage.setItem('iwt.swiped', '1');
  setTimeout(() => {
    animating = false; renderPlay(); render();
    if (statusOf(data, idea, me()).s === 'match') showMatch(idea);
  }, 300);
}
function setVote(idea, v) {
  data.votes[voteKey(idea.id, me())] = { v, at: nowIso() };
  changed(true);
}
$('#b-yes').onclick = () => swipe('yes');
$('#b-no').onclick = () => swipe('no');
$('#b-maybe').onclick = () => swipe('maybe');
$('#b-undo').onclick = () => {
  const h = swipeHistory.pop(); if (!h) return;
  // Re-stamp with "now" so the undo wins over the swipe when the two phones merge.
  data.votes[h.key] = h.prev && !h.askWasPending ? { ...h.prev, at: nowIso() } : { v: null, at: nowIso() };
  changed(); render();
};
function showMatch(idea) {
  $('#match-text').textContent = idea.text;
  $('#match').hidden = false;
  markMatchSeen(idea.id);
}
$('#match-ok').onclick = () => { $('#match').hidden = true; render(); };
function markMatchSeen(id) { const s = seenMatches(); if (!s.includes(id)) { s.push(id); localStorage.setItem('iwt.seenMatches', JSON.stringify(s.slice(-500))); } }

/* ================= ADD ================= */
let addCat = localStorage.getItem('iwt.addCat') || 'date';
const EXAMPLES = ['go wild swimming', 'see the Northern Lights', 'learn to make fresh pasta', 'go to a gig', 'build a firepit', 'take the kids rock pooling', 'have a night away, just us'];
function renderAdd() {
  if (!visibleCats().some(c => c.id === addCat)) addCat = 'date';
  $('#add-cats').innerHTML = chipsHtml(visibleCats(), addCat, null, '<button class="chip newcat" id="newcat">+ New</button>');
  $$('#add-cats .chip[data-cat]').forEach(b => b.onclick = () => { addCat = b.dataset.cat; localStorage.setItem('iwt.addCat', addCat); renderAdd(); });
  $('#newcat').onclick = () => openCategorySheet();
  $('#add-text').placeholder = EXAMPLES[Math.floor(Date.now() / 60000) % EXAMPLES.length];
  $('#add-btn').disabled = !tidyText($('#add-text').value) || !me();
  $('#add-btn').onpointerdown = e => e.preventDefault();
  $('#add-hint').textContent = !me() ? 'Finish setting up first (Settings).' : partner() ? `${partner().name} will see it next time they play.` : 'They\'ll see it once they join.';
  const mine = visibleIdeas().filter(i => i.by === me()).sort((a, b) => (b.addedAt || '') < (a.addedAt || '') ? -1 : 1).slice(0, 6);
  $('#add-nudge').innerHTML = nudgeHtml('added'); bindNudges('#add-nudge');
  $('#add-recent').innerHTML = mine.length ? `<div class="h3 lab">You added</div>` + mine.map(rowHtml).join('') : '';
  bindRows('#add-recent');
}
$('#add-text').addEventListener('input', () => { $('#add-btn').disabled = !tidyText($('#add-text').value) || !me(); });
$('#add-text').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (!$('#add-btn').disabled) addIdea(); } });
$('#add-btn').onclick = () => addIdea();
// Keyboard up: hide the bottom bar (so it can't sit over the page) and keep the Add button in view.
function keyboardCheck() {
  const vv = window.visualViewport; if (!vv) return;
  const up = vv.height < window.innerHeight - 150 && document.activeElement && document.activeElement.matches('input, textarea');
  document.body.classList.toggle('typing', !!up);
  if (up && document.activeElement.id === 'add-text') $('#add-btn').scrollIntoView({ block: 'nearest' });
}
if (window.visualViewport) window.visualViewport.addEventListener('resize', keyboardCheck);
document.addEventListener('focusin', () => setTimeout(keyboardCheck, 350));
document.addEventListener('focusout', () => setTimeout(keyboardCheck, 50));
/* ---------- Inspire me: fill the box from the built-in bank ---------- */
const inspireSkipped = [];
const normT = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// The 🔥 ideas live in the private data repo, never in this public app, and are kept on the phone once loaded.
let privateBank = (() => { try { return JSON.parse(localStorage.getItem('iwt.pbank') || '{}'); } catch { return {}; } })();
async function loadPrivateBank(force) {
  if (!configured() || (!force && Date.now() - (+localStorage.getItem('iwt.pbankAt') || 0) < 86400e3 && privateBank.spicy)) return;
  try {
    const r = await fetch(`${repoUrl()}/contents/bank-private.json?ref=${encodeURIComponent(cfg.branch || 'main')}`, { headers: headers(), cache: 'no-store' });
    if (!r.ok) return;
    privateBank = JSON.parse(b64decode((await r.json()).content));
    localStorage.setItem('iwt.pbank', JSON.stringify(privateBank)); localStorage.setItem('iwt.pbankAt', Date.now());
  } catch {}
}
function inspire() {
  const bank = { ...(window.IWT_BANK || {}), ...privateBank };
  const have = new Set(liveIdeas(data).map(i => normT(i.text)));
  const fresh = cat => (bank[cat] || []).filter(t => !have.has(normT(t)) && !inspireSkipped.includes(t));
  let cat = addCat, pool = fresh(cat);
  if (!pool.length) {   // a custom category, or we've run out: pick from any shown category
    const cats = Object.keys(bank).filter(c => !(cfg.hideSpicy && c === 'spicy') && fresh(c).length);
    if (!cats.length) { inspireSkipped.length = 0; toast('That\'s every idea we\'ve got. Starting again'); return; }
    cat = cats[Math.floor(Math.random() * cats.length)]; pool = fresh(cat);
  }
  const t = pool[Math.floor(Math.random() * pool.length)];
  inspireSkipped.push(t); if (inspireSkipped.length > 300) inspireSkipped.shift();
  if (cat !== addCat) { addCat = cat; localStorage.setItem('iwt.addCat', addCat); renderAdd(); }
  $('#add-text').value = t; fitAddText();
  $('#add-btn').disabled = !me();
}
$('#inspire-btn').onclick = inspire;

function addIdea() {
  const text = tidyText($('#add-text').value); if (!text || !me()) return;
  const dupe = liveIdeas(data).find(i => i.text.toLowerCase() === text.toLowerCase());
  if (dupe) { toast('That one\'s already on the list'); return; }
  const idea = makeIdea({ text, cat: addCat, by: me() });
  data.ideas.push(idea);
  changed(true);
  $('#add-text').value = ''; fitAddText();
  renderAdd(); render();
  toast('Added', () => { idea.deleted = true; idea.updatedAt = nowIso(); changed(); render(); });
  $('#add-text').focus();
}

/* ---------- nudges: "I've played" / "I've added" ---------- */
const NUDGE = {
  played: { label: 'I\'ve played', done: 'swiping' },
  added: { label: 'I\'ve added', done: 'adding' },
};
const lastNudge = kind => (data.nudges || []).filter(n => n.from === me() && n.kind === kind).reduce((m, n) => n.at > m ? n.at : m, '');
function sendNudge(kind) {
  const p = partner(); if (!p) return;
  data.nudges = [...(data.nudges || []), { id: uid(), from: me(), to: p.id, kind, at: nowIso() }];
  changed(true); render();
  toast(`Nudged ${p.name}`);
}
// The nudge card: shows once you've done something since your last nudge of that kind.
function nudgeHtml(kind) {
  const p = partner(); if (!p || !me()) return '';
  const since = lastNudge(kind);
  const n = kind === 'added'
    ? liveIdeas(data).filter(i => i.by === me() && i.addedAt > since).length
    : Object.entries(data.votes).filter(([k, v]) => k.endsWith(':' + me()) && v.v && v.at > since).length;
  if (!n) return since && Date.now() - Date.parse(since) < 3 * 3600e3 ? `<div class="nudge sent"><span>✓</span><div class="grow">${esc(p.name)} has been nudged</div></div>` : '';
  const what = kind === 'added' ? `You've added ${n} new idea${n === 1 ? '' : 's'}.` : `You've swiped ${n} card${n === 1 ? '' : 's'}.`;
  return `<div class="nudge"><span>👋</span><div class="grow">${what} Let ${esc(p.name)} know?</div><button class="btn small" data-nudge="${kind}">Nudge</button></div>`;
}
function bindNudges(root) { $$(root + ' [data-nudge]').forEach(b => b.onclick = () => sendNudge(b.dataset.nudge)); }

/* ================= LIST ================= */
let listTab = 'match', listCat = 'all', openSections = {};
function groups() {
  const g = { match: [], maybe: [], no: [], waitingThem: [], waitingMe: [], done: [] };
  if (!me()) return g;
  const p = partner();
  for (const i of visibleIdeas()) {
    if (listCat !== 'all' && i.cat !== listCat) continue;
    const s = statusOf(data, i, me());
    if (s.s === 'done') g.done.push(i);
    else if (s.s === 'waiting') { if (s.on.includes(me())) g.waitingMe.push(i); else g.waitingThem.push(i); }
    else g[s.s].push(i);
  }
  const newest = (a, b) => (b.updatedAt || '') < (a.updatedAt || '') ? -1 : 1;
  Object.values(g).forEach(l => l.sort(newest));
  g.done.sort((a, b) => (b.doneAt || '') < (a.doneAt || '') ? -1 : 1);
  return g;
}
function renderList() {
  const g = groups(), pn = esc(partnerName());
  const tabs = [['match', 'Both want'], ['maybe', 'Maybes'], ['no', 'Not for us']];
  $('#list-tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab t-${k} ${listTab === k ? 'on' : ''}" data-t="${k}"><span class="n">${g[k].length}</span>${l}</button>`).join('');
  $$('#list-tabs .tab').forEach(b => b.onclick = () => { listTab = b.dataset.t; renderList(); });
  const used = new Set(visibleIdeas().map(i => i.cat));
  const cats = [{ id: 'all', name: 'All', emoji: '' }, ...visibleCats().filter(c => used.has(c.id))];
  $('#list-cats').innerHTML = cats.length > 2 ? chipsHtml(cats, listCat) : '';
  $$('#list-cats .chip').forEach(b => b.onclick = () => { listCat = b.dataset.cat; renderList(); });
  $('#list-kicker').textContent = partner() ? `${myName()} & ${partner().name}` : 'The list';
  let h = '';
  if (g.waitingMe.length) h += `<div class="notice"><span>🃏</span><div class="grow"><b>${g.waitingMe.length}</b> waiting for you to swipe</div><button class="btn small" id="go-play">Play</button></div>`;
  const list = g[listTab];
  if (!list.length) h += `<div class="listempty"><span class="em">${listTab === 'match' ? '💞' : listTab === 'maybe' ? '🤔' : '🙅'}</span>${listTab === 'match' ? `Things you both say yes to land here.` : listTab === 'maybe' ? 'Ideas where one of you said maybe.' : 'Anything either of you said no to.'}</div>`;
  else h += list.map(rowHtml).join('');
  if (listTab === 'match' && g.done.length) h += sectionHtml('done', `Done (${g.done.length})`, g.done);
  if (g.waitingThem.length) h += sectionHtml('waitingThem', `Waiting on ${pn} (${g.waitingThem.length})`, g.waitingThem);
  $('#list-body').innerHTML = h;
  $('#go-play') && ($('#go-play').onclick = () => show('play'));
  $$('#list-body .section').forEach(b => b.onclick = () => { openSections[b.dataset.sec] = !openSections[b.dataset.sec]; renderList(); });
  bindRows('#list-body');
  if (listTab === 'match') g.match.forEach(i => markMatchSeen(i.id));
  $('#badge-list').hidden = true;
}
function sectionHtml(key, label, items) {
  const open = !!openSections[key];
  return `<button class="section ${open ? 'open' : ''}" data-sec="${key}">${label}${ICON_CHEV}</button>` + (open ? items.map(rowHtml).join('') : '');
}
// One row: tile, text, a status line, and a tick on matches.
function rowHtml(i) {
  const c = catOf(data, i.cat), s = me() ? statusOf(data, i, me()) : { s: 'waiting', on: [] };
  const p = partner(), pn = esc(partnerName());
  const bits = [];
  if (s.s === 'done') bits.push(`<span>Done ${ago(i.doneAt)}</span>`);
  else if (s.s === 'match') bits.push(`<span class="pill yes">💞 Both yes</span>`);
  else if (s.s === 'maybe') bits.push(`<span class="pill ${s.vm}">You: ${VWORD[s.vm]}</span><span class="pill ${s.vp}">${pn}: ${VWORD[s.vp]}</span>`);
  else if (s.s === 'no') {
    if (s.noBy.includes(me())) bits.push(`<span class="pill no">You 👎</span>`);
    if (p && s.noBy.includes(p.id)) bits.push(`<span class="pill no">${pn} 👎</span>`);
    if (p && (i.asked || []).includes(me()) && s.vp === 'no') bits.push('<span>Asked again · still no</span>');
  } else if (s.s === 'waiting') {
    if (s.asked && p && s.on.includes(p.id)) bits.push(`<span class="pill wait">Asked ${pn} again</span>`);
    else if (s.on.includes(me())) bits.push(`<span class="pill wait">Your turn to swipe</span>`);
    else bits.push(`<span class="pill wait">Waiting on ${pn}</span>`);
    if (s.vm) bits.push(`<span class="pill ${s.vm}">You: ${VWORD[s.vm]}</span>`);
  }
  if (i.by && s.s !== 'done') bits.push(`<span>${i.by === me() ? 'Your idea' : `${esc(nameOf(data, i.by))}'s idea`}</span>`);
  const tick = s.s === 'match' || s.s === 'done' ? `<button class="tick ${s.s === 'done' ? 'on' : ''}" data-tick="${i.id}" aria-label="Done">${ICON_TICK}</button>` : '';
  const ask = me() && canAskAgain(data, i, me()) ? `<button class="btn small ghost" data-ask="${i.id}">Ask again</button>` : '';
  return `<div class="row ${s.s === 'done' ? 'done' : ''}" data-id="${i.id}">${tile(c)}<div class="txt"><div class="t">${esc(i.text)}</div><div class="s">${bits.join('')}</div></div>${tick}${ask}</div>`;
}
function bindRows(root) {
  $$(root + ' .row').forEach(r => r.onclick = e => {
    if (e.target.closest('[data-tick]')) return toggleDone(e.target.closest('[data-tick]').dataset.tick);
    if (e.target.closest('[data-ask]')) return openIdea(r.dataset.id, { focusAsk: true });
    openIdea(r.dataset.id);
  });
}
function toggleDone(id) {
  const i = byId(id); if (!i) return;
  const before = { done: i.done, doneAt: i.doneAt, doneBy: i.doneBy };
  Object.assign(i, i.done ? { done: false, doneAt: null, doneBy: null } : { done: true, doneAt: nowIso(), doneBy: me() }, { updatedAt: nowIso() });
  changed(); render();
  if (i.done) toast('Done! Nice one 🎉', () => { Object.assign(i, before, { updatedAt: nowIso() }); changed(); render(); });
}

/* ---------- idea sheet ---------- */
let sheetIdea = null, editCat = null;
function openSheet(html) { $('#sheet-body').innerHTML = '<div class="grab"></div>' + html; if (!$('#sheet').open) { $('#sheet').showModal(); history.pushState({ sheet: 1 }, ''); } }
function closeSheet() { if ($('#sheet').open) history.back(); }
$('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) closeSheet(); });
$('#sheet').addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });
function openIdea(id, { focusAsk } = {}) {
  const i = byId(id); if (!i) return;
  sheetIdea = id; editCat = i.cat;
  const c = catOf(data, i.cat), s = statusOf(data, i, me()), p = partner(), pn = esc(partnerName());
  const vm = voteOf(data, i, me()), vp = p ? voteOf(data, i, p.id) : null;
  const label = { match: '💞 You both want to', maybe: '🤔 Maybe', no: '🙅 Not for us', waiting: '⏳ Waiting', done: '✅ Done' }[s.s];
  const theirs = !p ? 'Not joined yet' : s.s === 'waiting' && s.on.includes(p.id) ? 'Not swiped yet' : vp ? `${VEMOJI[vp]} ${VWORD[vp]}` : 'Not swiped yet';
  let h = `<div style="display:flex;gap:12px;align-items:center">${tile(c)}<div><div class="kicker">${esc(c.name)}</div><div class="h3" style="margin:2px 0 0">${label}</div></div></div>
    <div class="kicker" style="margin-top:16px">I want to…</div><h2 class="sh-text hd">${esc(i.text)}</h2>
    <div class="kicker">Added by ${esc(i.by === me() ? 'you' : i.by ? nameOf(data, i.by) : 'someone')} · ${ago(i.addedAt)}${i.done ? ` · done ${ago(i.doneAt)}` : ''}</div>
    <div class="who"><div><div class="nm">You</div><div class="v">${vm ? `${VEMOJI[vm]} ${VWORD[vm]}` : 'Not swiped yet'}</div></div><div><div class="nm">${pn}</div><div class="v">${theirs}</div></div></div>`;
  if (i.ask && i.ask.note) h += `<p class="hint">${esc(nameOf(data, i.ask.from))} asked again: “${esc(i.ask.note)}”</p>`;
  if (i.by !== me() || vm !== 'yes') h += `<div class="h3 lab">Your answer</div><div class="seg" id="sh-vote">${['yes', 'maybe', 'no'].map(v => `<button class="${v} ${vm === v ? 'on' : ''}" data-v="${v}">${VEMOJI[v]} ${VWORD[v]}</button>`).join('')}</div>`;
  if (canAskAgain(data, i, me())) h += `<div class="h3 lab">Ask ${pn} again?</div><p class="hint" style="margin-top:0">They'll get it back in their pile once. If it's still no, it stays no.</p>
    <label class="field"><textarea id="sh-note" rows="2" maxlength="120" placeholder="Go on, it'll be fun…"></textarea></label><button class="btn wide" style="margin-top:0" id="sh-ask">Ask ${pn} again</button>`;
  h += '<div class="actions">';
  if (s.s === 'match' || s.s === 'done') h += `<button class="btn ${i.done ? 'ghost' : 'yesb'}" id="sh-done">${i.done ? 'Not done yet' : '✓ We did it!'}</button>`;
  if (i.by === me()) h += `<button class="btn ghost" id="sh-edit">Edit</button><button class="btn ghost danger" id="sh-del">Delete</button>`;
  h += `<button class="linkbtn" id="sh-close">Close</button></div>`;
  openSheet(h);
  $$('#sh-vote button').forEach(b => b.onclick = () => {
    const was = statusOf(data, i, me()).s;
    setVote(i, b.dataset.v);
    if (was !== 'match' && statusOf(data, i, me()).s === 'match') { closeSheet(); render(); showMatch(i); return; }
    openIdea(id); render();
  });
  $('#sh-ask') && ($('#sh-ask').onclick = () => askAgain(i, $('#sh-note').value.trim()));
  if (focusAsk && $('#sh-note')) setTimeout(() => $('#sh-note').focus(), 200);
  $('#sh-done') && ($('#sh-done').onclick = () => { toggleDone(i.id); closeSheet(); });
  $('#sh-edit') && ($('#sh-edit').onclick = () => editIdea(i));
  $('#sh-del') && ($('#sh-del').onclick = () => {
    if (!confirm('Delete this idea for both of you?')) return;
    i.deleted = true; i.updatedAt = nowIso(); changed(); closeSheet(); render();
    toast('Deleted', () => { i.deleted = false; i.updatedAt = nowIso(); changed(); render(); });
  });
  $('#sh-close').onclick = closeSheet;
}
function askAgain(i, note) {
  i.ask = { from: me(), to: partner().id, note, at: nowIso() };
  i.asked = [...new Set([...(i.asked || []), me()])];
  i.updatedAt = nowIso();
  changed(true); closeSheet(); render();
  toast(`Sent back to ${partnerName()}`);
}
function editIdea(i) {
  openSheet(`<h2 class="mid hd" style="margin-bottom:8px">Edit idea</h2>
    <label class="field"><span>I want to…</span><textarea id="ed-text" rows="2" maxlength="140">${esc(i.text)}</textarea></label>
    <div class="h3 lab">Category</div><div class="chips wrap" id="ed-cats"></div>
    <div class="actions"><button class="btn" id="ed-save">Save</button><button class="linkbtn" id="ed-cancel">Cancel</button></div>`);
  const paint = () => { $('#ed-cats').innerHTML = chipsHtml(visibleCats(), editCat); $$('#ed-cats .chip').forEach(b => b.onclick = () => { editCat = b.dataset.cat; paint(); }); };
  paint();
  $('#ed-save').onclick = () => { const t = tidyText($('#ed-text').value); if (!t) return; i.text = t; i.cat = editCat; i.updatedAt = nowIso(); changed(); openIdea(i.id); render(); };
  $('#ed-cancel').onclick = () => openIdea(i.id);
}

/* ---------- new category ---------- */
const EMOJI_CHOICES = ['🎨', '🎵', '📚', '🏃', '⚽', '🎮', '🌊', '⛺', '🚲', '🎭', '🧘', '🐶', '🌱', '🛠️', '💸', '🎁', '🍰', '☕', '🎄', '🏰', '📷', '💪', '🧩', '🎓'];
function openCategorySheet() {
  let em = EMOJI_CHOICES[0];
  openSheet(`<h2 class="mid hd">New category</h2>
    <label class="field"><span>Name</span><input id="nc-name" maxlength="24" placeholder="e.g. Learn something"></label>
    <div class="h3 lab">Icon</div><div class="emojis" id="nc-em"></div>
    <div class="actions"><button class="btn" id="nc-save">Add category</button><button class="linkbtn" id="nc-cancel">Cancel</button></div>`);
  const paint = () => { $('#nc-em').innerHTML = EMOJI_CHOICES.map(e => `<button class="${e === em ? 'on' : ''}">${e}</button>`).join(''); $$('#nc-em button').forEach(b => b.onclick = () => { em = b.textContent; paint(); }); };
  paint(); setTimeout(() => $('#nc-name').focus(), 150);
  $('#nc-save').onclick = () => {
    const name = $('#nc-name').value.trim(); if (!name) return;
    const cat = { id: 'c-' + uid(), name, emoji: em, addedAt: nowIso(), updatedAt: nowIso() };
    data.categories.push(cat); addCat = cat.id; localStorage.setItem('iwt.addCat', addCat);
    changed(); closeSheet(); render();
  };
  $('#nc-cancel').onclick = closeSheet;
}

/* ================= SETTINGS ================= */
function renderSettings() {
  const p = partner(), custom = (data.categories || []).filter(c => !c.deleted);
  const dev = myDevice();
  let h = `<div class="group"><h3>You</h3>
    <div class="srow"><label class="field grow" style="margin:0"><span>Your name</span><input id="s-name" value="${esc(myName())}" maxlength="20"></label></div>
    <div class="srow"><div class="grow">Show 🔥 Spicy on this phone<small>Hides the cards and list entries here. Handy if a phone gets borrowed.</small></div><input type="checkbox" class="switch" id="s-spicy" ${cfg.hideSpicy ? '' : 'checked'}></div></div>`;
  h += `<div class="group"><h3>Notifications</h3>`;
  if (!notifsOn()) h += `<div class="srow"><div class="grow">Hear when you match, or when ${esc(partnerName())} nudges you.</div><button class="btn small" id="s-notif">Turn on</button></div>`;
  else h += `<div class="srow"><div class="grow">It's a match<small>When you both say yes</small></div><input type="checkbox" class="switch" data-pref="matches" ${dev.matches !== false ? 'checked' : ''}></div>
    <div class="srow"><div class="grow">Asked again<small>When ${esc(partnerName())} sends a "no" back to you</small></div><input type="checkbox" class="switch" data-pref="ideas" ${dev.ideas !== false ? 'checked' : ''}></div>
    <div class="srow"><div class="grow">Nudges<small>When ${esc(partnerName())} taps "I've played" or "I've added"</small></div><input type="checkbox" class="switch" data-pref="nudges" ${dev.nudges !== false ? 'checked' : ''}></div>
    <div class="srow"><div class="grow"><small>🔥 Spicy ones never show the idea on the lock screen.</small></div></div>`;
  h += `</div>`;
  h += `<div class="group"><h3>The two of you</h3>
    ${peopleList(data).map(x => `<div class="srow"><div class="grow">${esc(x.name)}${x.id === me() ? ' (you)' : ''}<small>Joined ${ago(x.joinedAt)}</small></div></div>`).join('')}
    <div class="srow"><div class="grow">${p ? 'Setup link' : 'Invite your other half'}<small>Send it straight to them. It contains the key, so don't post it anywhere.</small></div><button class="btn small" id="s-link">${navigator.share ? 'Share' : 'Copy'}</button></div></div>`;
  h += `<div class="group"><h3>Your categories</h3>
    ${custom.map(c => `<div class="srow"><div class="grow">${c.emoji} ${esc(c.name)}</div><button class="linkbtn danger" data-delcat="${c.id}">Remove</button></div>`).join('') || '<div class="srow"><div class="grow"><small>Add your own from the Add screen.</small></div></div>'}
    <div class="srow"><button class="linkbtn" id="s-newcat">+ New category</button></div></div>`;
  h += `<div class="group"><h3>Shared storage</h3>
    <label class="field"><span>GitHub username</span><input id="s-owner" value="${esc(cfg.owner || '')}" autocapitalize="off" autocomplete="off"></label>
    <label class="field"><span>Data repo</span><input id="s-repo" value="${esc(cfg.repo || '')}" autocapitalize="off" autocomplete="off"></label>
    <label class="field"><span>Access key</span><input id="s-token" type="password" value="${esc(cfg.token || '')}" autocomplete="off"></label>
    <div class="srow"><button class="btn small" id="s-save">Save &amp; sync</button><span class="grow"></span><span class="mono" id="s-sync"></span></div></div>`;
  const v = window.IWT_VERSION || {};
  h += `<div class="group"><h3>About</h3>
    <div class="srow"><div class="grow">Version ${esc(v.number)}<small id="s-latest">Released ${esc(v.date)}</small></div><button class="linkbtn" id="s-export">Back up</button></div>
    <div class="srow"><div class="grow"><small class="mono">github.com/${esc(window.IWT_APP_REPO || '')}</small></div></div></div>`;
  $('#settings-body').innerHTML = h;
  $('#s-name').onchange = e => { const n = e.target.value.trim(); if (!n || !me()) return; data.people[me()] = { ...data.people[me()], name: n, updatedAt: nowIso() }; changed(); render(); };
  $('#s-spicy').onchange = e => { cfg.hideSpicy = !e.target.checked; saveCfg(); render(); };
  $('#s-notif') && ($('#s-notif').onclick = async () => { await enableNotifs(); renderSettings(); });
  $$('[data-pref]').forEach(x => x.onchange = () => setDevicePref(x.dataset.pref, x.checked));
  $('#s-link').onclick = shareSetupLink;
  $$('[data-delcat]').forEach(b => b.onclick = () => {
    const c = data.categories.find(x => x.id === b.dataset.delcat); const n = liveIdeas(data).filter(i => i.cat === c.id).length;
    if (!confirm(n ? `Remove "${c.name}"? Its ${n} idea${n === 1 ? '' : 's'} will keep their place on the list.` : `Remove "${c.name}"?`)) return;
    c.deleted = true; c.updatedAt = nowIso(); changed(); renderSettings();
  });
  $('#s-newcat').onclick = () => openCategorySheet();
  $('#s-save').onclick = () => { cfg.owner = $('#s-owner').value.trim(); cfg.repo = $('#s-repo').value.trim(); cfg.token = $('#s-token').value.trim(); saveCfg(); sync().then(() => { if (!me()) show('welcome'); }); };
  $('#s-sync').textContent = $('#syncdot').title || '';
  $('#s-export').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `i-want-to-backup-${todayStr()}.json`; a.click();
  };
  checkLatest();
}
async function checkLatest() {
  try {
    const r = await fetch(`https://api.github.com/repos/${window.IWT_APP_REPO}/contents/version.js`, { cache: 'no-store' });
    if (!r.ok) return;
    const m = atob((await r.json()).content.replace(/\s/g, '')).match(/number:\s*'([^']+)'/);
    if (m && $('#s-latest')) $('#s-latest').textContent = m[1] === window.IWT_VERSION.number ? `Up to date · released ${window.IWT_VERSION.date}` : `Version ${m[1]} is out. Close and reopen the app to update.`;
  } catch {}
}
function setupLink() {
  const { owner, repo, branch, path, token } = cfg;
  return `${location.origin}${location.pathname}#setup=${encodeURIComponent(btoa(JSON.stringify({ owner, repo, branch, path, token })))}`;
}
async function shareSetupLink() {
  if (!configured()) { toast('Connect this phone first'); return; }
  const url = setupLink();
  if (navigator.share) { try { await navigator.share({ title: 'I want to…', text: `${myName() || 'I'}'ve set up "I want to…" for us. Open this on your phone:`, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Link copied. Send it to them directly'); } catch { prompt('Copy this link', url); }
}

/* ================= GITHUB STORAGE (same approach as Larder) ================= */
function b64encode(str) { const bytes = new TextEncoder().encode(str); let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b)); return btoa(bin); }
function b64decode(b64) { const bin = atob(b64.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
const repoUrl = () => `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
const apiUrl = () => `${repoUrl()}/contents/${(cfg.path || 'ideas.json').split('/').map(encodeURIComponent).join('/')}`;
const headers = () => ({ Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
async function ghGet() {
  const r = await fetch(`${apiUrl()}?ref=${encodeURIComponent(cfg.branch || 'main')}`, { headers: headers(), cache: 'no-store' });
  if (r.status === 404) return { remote: emptyData(), sha: null };
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}`), { status: r.status });
  const j = await r.json();
  return { remote: Object.assign(emptyData(), JSON.parse(b64decode(j.content))), sha: j.sha };
}
async function ghPut(d, sha) {
  const body = { message: `Update (${myName() || 'phone'})`, content: b64encode(JSON.stringify(d, null, 1)), branch: cfg.branch || 'main' };
  if (sha) body.sha = sha;
  const r = await fetch(apiUrl(), { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}`), { status: r.status });
}
// Something changed on this phone: save, sync soon, and (for things the other person should hear about) nudge the notifier.
function changed(notify) {
  saveLocal(); scheduleSync();
  if (notify) localStorage.setItem('iwt.notifyPending', '1');
}
let syncing = false, syncAgain = false, syncTimer = null;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 800); }
function setSync(state, title) { const d = $('#syncdot'); d.className = 'dot ' + state; d.title = title; }
async function sync() {
  if (!configured()) { setSync('', 'Not connected'); return; }
  if (syncing) { syncAgain = true; return; }
  syncing = true; setSync('busy', 'Syncing…');
  try {
    touchPerson();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { remote, sha } = await ghGet();
      const merged = merge(remote, data);
      data = merged; saveLocal();
      if (!$('#sheet').open && !animating) render();
      if (JSON.stringify(merge(remote, emptyData())) === JSON.stringify(merged) && sha) break;
      try { await ghPut(merged, sha); break; }
      catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 4) continue; throw e; }
    }
    setSync('ok', 'Synced ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    maybeNotify(); loadPrivateBank();
  } catch (e) {
    console.error(e);
    setSync('err', e.status === 401 ? 'Access key rejected. Check Settings' : e.status === 404 ? 'Data repo not found. Check Settings' : 'Offline. Changes are saved on this phone');
    if (e.status === 401 || e.status === 404) toast($('#syncdot').title);
  } finally { syncing = false; if (syncAgain) { syncAgain = false; sync(); } }
}
function touchPerson() {
  if (!me() || !data.people[me()]) return;
  const p = data.people[me()];
  if (Date.now() - Date.parse(p.lastSeen || 0) > 6 * 3600e3) { data.people[me()] = { ...p, lastSeen: nowIso(), updatedAt: nowIso() }; saveLocal(); }
}

/* ---------- notifications: phones ask the job in the data repo to send them ---------- */
let notifyTimer = null;
async function maybeNotify() {
  if (localStorage.getItem('iwt.notifyPending') !== '1' || !configured()) return;
  const wait = 45e3 - (Date.now() - (+localStorage.getItem('iwt.lastNotify') || 0));   // at most one run every 45s; it catches up on everything
  if (wait > 0) { clearTimeout(notifyTimer); notifyTimer = setTimeout(maybeNotify, wait + 500); return; }
  localStorage.setItem('iwt.lastNotify', Date.now());
  try {
    const r = await fetch(`${repoUrl()}/actions/workflows/notify.yml/dispatches`, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: cfg.branch || 'main' }) });
    if (r.ok || r.status === 404 || r.status === 403) localStorage.removeItem('iwt.notifyPending');   // 403/404: key can't start jobs; don't keep trying
  } catch {}
}
function deviceId() { let d = localStorage.getItem('iwt.device'); if (!d) { d = uid(); localStorage.setItem('iwt.device', d); } return d; }
const myDevice = () => data.devices[deviceId()];
const notifsOn = () => !!(myDevice() && myDevice().sub && !myDevice().gone && 'Notification' in window && Notification.permission === 'granted');
function b64urlToBytes(s) { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function enableNotifs() {
  if (!me()) { toast('Finish setting up first'); return; }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('This browser can\'t do notifications. Open the app in Chrome'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifications are blocked. Allow them in Chrome\'s site settings'); return; }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(window.IWT_VAPID) });
  const prev = myDevice() || {};
  data.devices[deviceId()] = { id: deviceId(), pid: me(), name: myName(), sub: sub.toJSON(), matches: prev.matches ?? true, ideas: prev.ideas ?? true, nudges: prev.nudges ?? true, updatedAt: nowIso() };
  changed(); render();
  reg.showNotification('Notifications are on', { body: 'You\'ll hear when you both want to do something.', icon: 'icon-192.png', badge: 'badge-96.png' });
}
function setDevicePref(key, val) { const d = myDevice(); if (!d) return; data.devices[d.id] = { ...d, [key]: val, updatedAt: nowIso() }; changed(); }
async function refreshSubscription() {
  if (!notifsOn()) return;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    const d = myDevice();
    if (sub && (JSON.stringify(sub.toJSON()) !== JSON.stringify(d.sub) || d.pid !== me() || d.name !== myName())) { data.devices[deviceId()] = { ...d, pid: me(), name: myName(), sub: sub.toJSON(), updatedAt: nowIso() }; changed(); }
  } catch {}
}

/* ================= WELCOME ================= */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (screen === 'welcome') render(); });
window.addEventListener('appinstalled', () => { localStorage.setItem('iwt.installed', '1'); if (screen === 'welcome') renderWelcome(); });
const standalone = () => matchMedia('(display-mode: standalone)').matches;
const isInstalled = () => standalone() || localStorage.getItem('iwt.installed') === '1';
function browserKind() {
  const ua = navigator.userAgent;
  if (/WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|; wv\)/i.test(ua)) return 'inapp';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/iPhone|iPad/i.test(ua)) return 'ios';
  if (/Chrome/i.test(ua)) return 'chrome';
  return 'other';
}
// Opens this page in Chrome on Android, carrying the setup (each browser keeps its own storage).
function chromeLink() { return `intent://${location.host}${location.pathname}${configured() ? setupLink().slice(setupLink().indexOf('#')) : ''}#Intent;scheme=https;package=com.android.chrome;end`; }
function installHelp() {
  if (installEvt) return { p: 'So it opens like any other app.', b: '<button class="btn" id="w-install">Install</button>' };
  switch (browserKind()) {
    case 'inapp': return { p: 'This opened inside another app, which can\'t install it. Open it in Chrome, then install from there.', b: `<a class="btn" href="${chromeLink()}">Open in Chrome</a>` };
    case 'samsung': return { p: 'In Samsung Internet, tap the <b>≡</b> menu at the bottom, then <b>Add page to</b> → <b>Home screen</b>.', b: '' };
    case 'firefox': return { p: 'In Firefox, tap <b>⋮</b>, then <b>Install</b> (or <b>Add to Home screen</b>).', b: '' };
    case 'ios': return { p: 'In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.', b: '' };
    default: return { p: 'In Chrome, tap <b>⋮</b> at the top right, then <b>Add to Home screen</b> (or <b>Install app</b>).', b: '' };
  }
}
let showAdvanced = false;
function needsWelcome() { return !configured() || !me() || (localStorage.getItem('iwt.welcomeDone') !== '1' && !(isInstalled() && notifsOn())); }
function renderWelcome() {
  $('#w-title').textContent = me() ? `Hi ${myName()}!` : 'I want to…';
  const people = peopleList(data);
  const whoBody = !configured() ? '' : `<div class="people">${people.map(x => `<button class="btn ghost" data-pick="${x.id}">I'm ${esc(x.name)}</button>`).join('')}</div>
    <label class="field"><span>${people.length ? 'Or, someone new:' : 'Your name'}</span><input id="w-name" maxlength="20" placeholder="Your first name"></label><button class="btn" id="w-join">That's me</button>`;
  const steps = [
    { done: configured(), t: 'Connect', p: 'Open the setup link you were sent.', b: '<button class="btn ghost" id="w-setup">I\'m the first one: enter the key</button>' },
    { done: !!me(), t: 'Who are you?', p: people.length ? 'Pick your name, or add yours.' : 'So your other half knows who added what.', b: whoBody },
    { done: isInstalled(), t: 'Put it on your home screen', ...installHelp() },
    { done: notifsOn(), t: 'Turn on notifications', p: 'Hear when you both want to do something.', b: '<button class="btn" id="w-notif">Turn on notifications</button>' },
  ];
  $('#w-steps').innerHTML = steps.map((s, i) => `<div class="step ${s.done ? 'done' : ''}"><div class="n">${s.done ? '✓' : i + 1}</div><div style="flex:1;min-width:0"><b>${s.t}</b>${s.done ? '' : `<p>${s.p}</p>${s.b}`}</div></div>`).join('');
  $('#w-advanced').hidden = !showAdvanced || configured();
  if (showAdvanced && !configured()) {
    $('#w-advanced').innerHTML = `<div class="group" style="margin-top:14px"><h3>Shared storage</h3>
      <label class="field"><span>GitHub username</span><input id="wa-owner" value="${esc(cfg.owner || '')}" autocapitalize="off"></label>
      <label class="field"><span>Data repo</span><input id="wa-repo" value="${esc(cfg.repo || '')}" autocapitalize="off"></label>
      <label class="field"><span>Access key</span><input id="wa-token" type="password" autocomplete="off"></label>
      <div class="srow"><button class="btn" id="wa-save">Connect</button></div></div>`;
    $('#wa-save').onclick = async () => { cfg.owner = $('#wa-owner').value.trim(); cfg.repo = $('#wa-repo').value.trim(); cfg.token = $('#wa-token').value.trim(); saveCfg(); showAdvanced = false; await sync(); renderWelcome(); };
  }
  $('#w-setup') && ($('#w-setup').onclick = () => { showAdvanced = true; renderWelcome(); setTimeout(() => $('#wa-token') && $('#wa-token').focus(), 100); });
  $$('[data-pick]').forEach(b => b.onclick = () => { cfg.person = b.dataset.pick; saveCfg(); refreshSubscription(); renderWelcome(); render(); });
  $('#w-join') && ($('#w-join').onclick = () => {
    const n = $('#w-name').value.trim(); if (!n) { $('#w-name').focus(); return; }
    const id = 'p-' + uid();
    data.people[id] = { id, name: n, joinedAt: nowIso(), updatedAt: nowIso() };
    cfg.person = id; saveCfg(); changed(true); renderWelcome();
  });
  $('#w-install') && ($('#w-install').onclick = doInstall);
  $('#w-notif') && ($('#w-notif').onclick = async () => { if (!me()) { toast('Pick your name first'); return; } await enableNotifs(); renderWelcome(); });
  const ready = configured() && me();
  $('#w-skip').hidden = !ready;
  $('#w-skip').textContent = steps.every(s => s.done) ? 'Let\'s go' : 'Skip for now';
  if (steps.every(s => s.done)) localStorage.setItem('iwt.welcomeDone', '1');
}
async function doInstall() { if (!installEvt) return; installEvt.prompt(); const r = await installEvt.userChoice; if (r.outcome === 'accepted') { localStorage.setItem('iwt.installed', '1'); installEvt = null; render(); } }
$('#w-skip').onclick = () => { localStorage.setItem('iwt.welcomeDone', '1'); show('play', { noHistory: true }); };
function readSetupLink() {
  const m = location.hash.match(/setup=([^&]+)/); if (!m) return false;
  try { cfg = { ...cfg, ...JSON.parse(atob(decodeURIComponent(m[1]))) }; saveCfg(); history.replaceState(null, '', location.pathname); return true; }
  catch { toast('That setup link didn\'t work'); return false; }
}

/* ---------- toast ---------- */
let toastT;
function toast(text, actions) {
  const el = $('#toast');
  if (typeof actions === 'function') actions = [['Undo', actions]];
  actions = actions || [];
  el.innerHTML = `<span>${esc(text)}</span>` + actions.map((a, i) => `<button class="linkbtn" data-t="${i}">${esc(a[0])}</button>`).join('');
  el.style.pointerEvents = actions.length ? 'auto' : 'none';
  actions.forEach((a, i) => el.querySelector(`[data-t="${i}"]`).onclick = () => { el.classList.remove('on'); a[1](); });
  el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), actions.length ? 6000 : 2400);
}

/* ================= START ================= */
const fromLink = readSetupLink();
window.addEventListener('hashchange', () => { if (readSetupLink()) { show('welcome', { noHistory: true }); sync(); } });
const startTab = new URLSearchParams(location.search).get('tab');
show(needsWelcome() ? 'welcome' : (['play', 'add', 'list'].includes(startTab) ? startTab : 'play'), { noHistory: true });
if (startTab) history.replaceState(null, '', location.pathname);
sync();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sync(); } });
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false, pendingReload = false;
  const reloadNow = () => { if (reloading) return; if ($('#sheet').open || $('#add-text').value) { pendingReload = true; return; } reloading = true; location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) reloadNow(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pendingReload) reloadNow();
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {});
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { refreshSubscription(); reg.update().catch(() => {}); }).catch(() => {});
}
