# I want to…

A light-hearted app for two. Add things you'd like to do, swipe yes / maybe / no on each other's, and see what you both want.

- **Play**: swipe right for yes, left for no, up for maybe. Adding an idea counts as your own yes.
- **List**: *Both want* (tick them off when you've done them), *Maybes*, and *Not for us*, which shows who said no.
  You can **ask again** once on something the other person said no to, with a short note.
- **Categories**: date nights, days out, trips & holidays, food & drink, home & garden, family, 🔥 spicy, plus your own.
  Spicy can be hidden per phone, and its notifications never show the idea on the lock screen.

Built the same way as Larder: an installable web app on GitHub Pages (this repo), with the shared data in a
private repo (`i-want-to-data`) as one `ideas.json` file. Notifications are sent by a small job in that repo.

## Setup (once)
1. This repo → **Settings → Pages → Deploy from a branch → `main` / root**. It's then at `https://petelh.github.io/i-want-to/`.
2. Create a fine-grained access token: GitHub → Settings → Developer settings → Fine-grained tokens →
   *Only select repositories* → `i-want-to-data` → Permissions: **Contents: Read and write** and **Actions: Read and write**.
3. Open the app on your phone → *I'm the first one: enter the key* → paste it → pick your name → install → turn on notifications.
4. **Settings → Setup link → Share**, and send it to your other half.

Bump `version.js` and the cache name in `sw.js` on every release.
