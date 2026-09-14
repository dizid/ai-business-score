# Make the Foreground video — avatar version

The old abstract prompts are deleted. New plan: **your Flow avatar pitches
the product to camera** (Veo generates their voice, lip-synced), cut
together with real app footage and the two finished brand cards.

Already done:
- [x] Google AI Pro (2026-09-12, €21.99/mo)
- [x] ElevenLabs (2026-09-12, $6.40/mo) — now OPTIONAL, the avatar speaks
      for itself. Cancel it if you don't end up using it.
- [x] Brand cards finished in `cards/` (logo card, end card, YouTube thumbnail)

The video, ~55 seconds:

| # | What | Where it comes from |
|---|------|---------------------|
| 1 | Avatar hook: "ChatGPT gave ONE answer. Was it you?" | `prompts/avatar-1-hook.txt` |
| 2 | Avatar pitch: what Foreground does | `prompts/avatar-2-pitch.txt` |
| 3 | Real app: scan results scrolling (~12s) | your screen recording |
| 4 | Avatar: score 0–100 + what to fix | `prompts/avatar-3-score.txt` |
| 5 | Logo card (~4s) | `cards/card-logo.png` — done |
| 6 | Avatar CTA: "Three free scans. Foreground dot info." | `prompts/avatar-4-cta.txt` |
| 7 | End card (~5s) | `cards/card-end.png` — done |

---

## Part 1 — Generate the 4 avatar clips in Flow

- [ ] In Flow: mode **Ingredients to Video** → add YOUR AVATAR as the ingredient
- [ ] Set **16:9**, quality **Fast**
- [ ] Open `prompts/avatar-1-hook.txt`, copy everything BELOW the `---` line, paste, Generate
- [ ] Judge it on TWO things only:
      1. Does it look like your avatar? (if not: re-add the ingredient, regenerate)
      2. Is the spoken line right and clearly said? (small wording drift is fine)
- [ ] Keeper → download as `avatar-1.mp4` into `~/Videos/foreground-ad/`
- [ ] Repeat for `avatar-2-pitch.txt`, `avatar-3-score.txt`, `avatar-4-cta.txt`

Tips:
- All 4 prompts describe the SAME setting (office, evening, lamp light) on
  purpose — that's what makes 4 separate generations feel like one ad.
  Don't change the setting text.
- The dialogue is written to fit in 8 seconds. If a clip cuts off
  mid-sentence, shorten the quoted line a little and regenerate.
- If the voice sounds different between clips: regenerate the odd one out.
  Voice consistency is the flakiest part of this — 2 or 3 tries is normal.

## Part 2 — Record the app once (10 min)

- [ ] Log in at foreground.info/app, open a FINISHED scan report, browser
      full screen (F11)
- [ ] Press **Ctrl+Alt+Shift+R** (recording starts), scroll SLOWLY through
      the results — mentioned / not mentioned, competitor tally, the score —
      for ~15 seconds, press **Ctrl+Alt+Shift+R** again to stop
- [ ] File appears in `~/Videos`. Rename to `app-demo.mp4`, move it to the folder.

## Part 3 — Assemble in CapCut (capcut.com, free, in browser)

- [ ] New project, landscape 16:9. Upload: the 4 avatar clips, `app-demo.mp4`,
      and from this repo `brand/video/cards/card-logo.png` + `card-end.png`
- [ ] Drag onto the timeline in this order:
      **avatar-1 → avatar-2 → app-demo → avatar-3 → card-logo → avatar-4 → card-end**
- [ ] Keep the avatar clips' OWN audio (their voice is the voiceover). Only
      mute `app-demo.mp4` if it has sound.
- [ ] Trim `app-demo` to its best ~12 seconds. Set card-logo to ~4s, card-end to ~5s.
- [ ] During the app-demo clip, add ONE big text: **"A real Foreground scan."**
- [ ] Auto captions: Text/Captions menu → Auto captions → fix wrong words →
      small, white, bottom. (Facebook plays muted — captions are essential.)
- [ ] Music: studio.youtube.com → Audio Library → something minimal → drag in
      at ~10% volume, fade out at the end.
- [ ] Watch twice, Export 1080p.

## Part 4 — Publish

- [ ] **YouTube**: upload. Title: `Is ChatGPT recommending your business — or your competitor?`
      Thumbnail: `cards/thumbnail-youtube.png` (already made).
- [ ] **Facebook**: upload the same file natively (not a YouTube link).
      Optional shorter cut: avatar-1 → app-demo (6s) → avatar-4 → card-end ≈ 25s.

---

## If something looks wrong

| Problem | Fix |
|---|---|
| Avatar's face drifts between clips | Regenerate with the ingredient freshly attached. 2–3 tries is normal. |
| Line gets cut off at 8 seconds | Shorten the quoted dialogue a few words, regenerate. |
| Voice changes per clip | Regenerate the mismatched clip; keep the takes whose voices match. |
| Avatar won't say "Foreground dot info" cleanly | Try: "at foreground, dot, info" or let the END CARD carry the URL and cut the line to "Three free scans. On the house." |
| Weird text appears in the video | Regenerate — never expect readable text from Veo. The URL lives on the end card. |
