# Handoff: STATIC — Live AI Debate Player

## Overview
**STATIC** is a podcast concept where the participants are AI models — not humans. Each week there is one topic and a debate between two to four AIs that talk to each other in distinct, opinionated voices. This handoff covers the **flagship product screen: the live debate player**, which doubles as the brand reveal (wordmark, color system, and the four AI "cast" identities all live inside it).

The player shows a live episode: the AI currently speaking lights up in its signature color with an animated audio waveform, a live transcript streams in, and the scrubber head is tinted with the active speaker's color. The user can switch between three presentation modes (ESTUDIO / CHAT / AUDIO), play/pause, step between turns, change speed, and scrub.

---

## About the Design Files
The file in this bundle (`STATIC Player.dc.html`) is a **design reference created in HTML** — a working prototype that demonstrates the intended look, motion, and behavior. It is **not production code to copy verbatim**. The `.dc.html` format is a self-contained streaming-component prototype; treat it as a precise spec, not a source module.

**Your task:** recreate this design in the target codebase's environment using its established patterns and libraries. If there is no codebase yet, **React + TypeScript** is the recommended choice for this product (the prototype's logic maps cleanly to a React component with `useState` + `requestAnimationFrame`). The exact look — colors, type, spacing, motion — should be reproduced faithfully; the *implementation* (state library, audio engine, styling approach) should follow the host project's conventions.

> ⚠️ In the prototype, audio is **simulated** (a timeline of text "turns" with durations). In production this screen must be wired to a **real audio stream** (or per-turn audio clips) and, eventually, to a real-time multi-agent backend (see *Future Direction*). The visual timing system here is the contract for how the UI should react to "who is speaking now."

---

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, motion, and copy. Recreate the UI pixel-perfectly using the codebase's existing libraries and patterns. All values in this README are authoritative.

---

## Brand System (read first)

The brand is deliberately stark so it stays ownable and cheap to produce weekly:

- **Monochrome core:** near-black background, off-white foreground, monospace labels.
- **Color enters ONLY through the AIs.** Each of the four cast members owns one accent color ("their signal"). Nothing else in the UI is colored. This is the central rule — do not introduce brand gradients or extra accent colors.
- **No human faces.** Each AI is a simple geometric glyph inside a ring. Never render avatars/portraits.
- **Voice/tone of copy:** terse, confident, a little provocative, meta about being machines.

### The Cast (4 AIs)
| ID | Name | Role (ES) | Role (EN gloss) | Glyph | Signal color (oklch — source of truth) | Approx hex |
|----|------|-----------|-----------------|-------|------------------------------------------|-----------|
| `nova`  | **NOVA**  | EL ACELERADOR | The Accelerator (techno-optimist) | △ `U+25B3` | `oklch(0.80 0.15 75)`  | `#E6A23C` (amber) |
| `axiom` | **AXIOM** | EL LÓGICO     | The Logician (rational moderator) | ◇ `U+25C7` | `oklch(0.82 0.13 200)` | `#3FC7D6` (cyan) |
| `hex`   | **HEX**   | EL PROVOCADOR | The Provocateur (contrarian)      | ⬡ `U+2B22` | `oklch(0.72 0.20 350)` | `#EA4B92` (magenta) |
| `void`  | **VOID**  | EL ESCÉPTICO  | The Skeptic (doomer/philosopher)  | ○ `U+25CB` | `oklch(0.74 0.14 288)` | `#9D86E6` (violet) |

> Use the **oklch values as the source of truth** (they share lightness/chroma band and only vary in hue, which keeps the four signals visually balanced). The hex column is a fallback for environments without oklch support.

---

## Design Tokens

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#07070A` | App background (near-black, very slightly cool) |
| `--text-strong` | `#F4F4F8` | Headings, wordmark |
| `--text` | `#ECECF0` | Default text |
| `--text-body` | `#E2E2E8` | Transcript body copy |
| `--text-muted` | `rgba(255,255,255,0.45)` | Secondary labels |
| `--text-faint` | `rgba(255,255,255,0.30–0.40)` | Tertiary labels, timestamps |
| `--line` | `rgba(255,255,255,0.08)` | Hairline dividers / borders |
| `--line-strong` | `rgba(255,255,255,0.12)` | Idle avatar ring, transport buttons |
| `--panel` | `rgba(255,255,255,0.02)` | Transcript panel fill |
| `--panel-line` | `rgba(255,255,255,0.07)` | Transcript panel border |
| `--row-active` | `rgba(255,255,255,0.045)` | Active transcript row fill |
| `--btn-fill` | `#F4F4F8` | Play button (white) |
| Signal colors | see Cast table | The only chromatic colors in the UI |

Color helpers used in the prototype (reproduce however your stack prefers):
- **Speaking avatar glow:** `box-shadow: 0 0 70px color-mix(in oklch, <signal> 45%, transparent)`
- **Speaking avatar fill:** `radial-gradient(circle at 50% 45%, color-mix(in oklch, <signal> 24%, transparent), transparent 70%)`
- **Active legend chip:** bg `color-mix(in oklch, <signal> 14%, transparent)`, border `color-mix(in oklch, <signal> 40%, transparent)`

### Typography
Two Google fonts only:
- **Space Grotesk** (400/500/600/700) — display + body
- **JetBrains Mono** (400/500/700) — wordmark, all labels, numbers, timestamps

| Element | Font | Size | Weight | Letter-spacing | Notes |
|---------|------|------|--------|----------------|-------|
| Wordmark `STATIC` | JetBrains Mono | 23px | 700 | `0.34em` | color `#fff` |
| "EN DIRECTO" live tag | JetBrains Mono | 11px | 500 | `0.20em` | HEX magenta + blinking dot |
| Header meta (EP / count) | JetBrains Mono | 11px | 400 | `0.16em` | muted |
| View toggle buttons | JetBrains Mono | 10.5px | 400 | `0.16em` | active = white on `rgba(255,255,255,0.12)` |
| Topic tag (`DEBATE · SEMANA 24`) | JetBrains Mono | 11px | 400 | `0.30em` | faint |
| Topic headline | Space Grotesk | 30px | 600 | `-0.01em` | line-height 1.18, `text-wrap: balance`, max-width 720px |
| Avatar name | JetBrains Mono | 12.5px | 400 | `0.22em` | signal color when speaking, else `rgba(255,255,255,0.72)` |
| Avatar role | JetBrains Mono | 9.5px | 400 | `0.18em` | `rgba(255,255,255,0.34)` |
| Stage caption | JetBrains Mono | 11px | 400 | `0.22em` | signal color or faint |
| Transcript panel title | JetBrains Mono | 11px | 400 | `0.20em` | muted |
| Transcript speaker label | JetBrains Mono | 11px | 700 | `0.18em` | signal color |
| Transcript timestamp | JetBrains Mono | 10px | 400 | `0.10em` | `rgba(255,255,255,0.28)` |
| Transcript body | Space Grotesk | 15px | 400 | — | line-height 1.55, `text-wrap: pretty`, `#E2E2E8` |
| Time readouts | JetBrains Mono | 12px | 400 | `0.08em` | current = 0.7 alpha, total = 0.4 alpha |
| Speed button | JetBrains Mono | 12px | 400 | `0.06em` | label e.g. `1.0×` |
| Legend chips | JetBrains Mono | 10.5px | 400 | `0.14em` | glyph in signal color |

### Spacing / Radius / Sizing
- App padding: header `14px 30px`, main `18px 30px` (gap `20px` between stage and transcript), footer `13px 30px 15px`.
- Avatar diameter: **78px** in ESTUDIO/CHAT, **116px** in AUDIO. Glyph font-size 30px / 42px respectively. Idle ring `1px solid rgba(255,255,255,0.12)`; speaking ring `1px solid <signal>` + `transform: scale(1.06)`.
- Avatar column width 100px; row gap 18px; `flex-wrap: nowrap` (all four always in one row).
- Waveform bars under speaking avatar: 5 bars, 3px wide, 16px tall container, gap 3px, `border-radius: 2px`.
- Transcript panel: width **380px** (ESTUDIO), full-width centered max 820px (CHAT), hidden (AUDIO). Radius `16px`, border `1px solid rgba(255,255,255,0.07)`, padding `18px 18px 8px`.
- Transcript row: padding `13px 15px`, radius `12px`, `border-left: 2px solid <signal>`.
- Scrubber: 48 vertical bars filling full width, gap 2px, radius 2px, container height 30px; played = `rgba(255,255,255,0.78)`, unplayed = `rgba(255,255,255,0.14)`, the single "head" bar = active signal color + `0 0 12px <signal>` glow.
- Play button: 50px circle, white fill, dark icon, `box-shadow: 0 0 30px rgba(255,255,255,0.18)`. Transport (prev/next) buttons: 40px circle, `1px solid rgba(255,255,255,0.12)`, transparent.
- Legend chip: padding `6px 11px`, radius 8px.

### Motion (keyframes)
| Name | What | Spec |
|------|------|------|
| `wave` | Speaking waveform bars | `scaleY(0.22) ↔ scaleY(1)`, 0.8s ease-in-out infinite, per-bar `animation-delay` `i * 0.13s`, `transform-origin: bottom` |
| `ring` | Pulse rings around speaking avatar | `scale(1)→scale(1.9)`, `opacity 0.55→0`, 2s ease-out infinite; **two** rings, second delayed `1s` |
| `blink` | Live dot + typing dots | `opacity 1 ↔ 0.25`, live dot 1.5s / typing dots 1s (staggered 0.2s) |
| `drift` | Background grid | translate ~2% over 22s ease-in-out infinite (very subtle) |
| `bubblein` | New transcript row entry | `opacity 0→1`, `translateY(8px)→0`, 0.35s ease |
| Avatar state transition | size/glow/color | `transition: all .45s cubic-bezier(.4,0,.2,1)` |

Background ambiance: a `radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.035), transparent 60%)` vignette + a faint 64px grid (`rgba(255,255,255,0.025)` lines) that drifts. Both `pointer-events: none`.

---

## Screens / Views

This is a single full-viewport desktop screen (`height: 100vh`, `overflow: hidden`) with a fixed **header / main / footer** column. The `main` area changes layout based on the active **view** tab. Designed at ~1320×820; lays out cleanly down to ~960px wide.

### Header (fixed, all views)
- Left: `STATIC` wordmark · vertical hairline · **EN DIRECTO** with a blinking magenta dot (`oklch(0.72 0.20 350)`, `box-shadow: 0 0 10px` same).
- Right: meta row `EP.024 · 12.4K · ESCUCHANDO` (count in 0.7 alpha) then a segmented **view toggle** (ESTUDIO / CHAT / AUDIO) in a `rgba(255,255,255,0.04)` pill with 1px border, radius 9px, 3px padding.

### View A — ESTUDIO (default)
Two-column main: **stage** (flex, centered) + **transcript panel** (380px, right).
- **Stage** (vertical stack, centered, gap 24px): topic tag → topic headline → row of 4 avatars (78px) → caption.
- **Transcript panel** visible on the right.

### View B — CHAT
Stage hidden (`display:none`). Transcript panel becomes full-width, centered, max 820px — a focused "live chat log" reading mode.

### View C — AUDIO
Transcript hidden. Stage only, avatars enlarged to **116px**, centered — a minimal "now playing" mode.

### Footer (fixed, all views)
- **Row 1 — scrubber:** current time · 48-bar clickable waveform (seek on click) · total time.
- **Row 2 — transport + legend:** left group = `⏮` prev-turn, **play/pause** (white circle; play = CSS triangle, pause = two bars), `⏭` next-turn, then speed button (`1.0×` → cycles 1.25/1.5/2). Right group = the 4 cast members as legend chips; the active speaker's chip is tinted with its signal color.

---

## The Avatar (key component, all views)
Vertical stack, 100px wide:
1. **Ring/circle** (78px or 116px). Idle: transparent-ish fill (`rgba(255,255,255,0.015)`), faint ring. Speaking: signal-colored ring, radial signal fill, 70px signal glow, `scale(1.06)`, **two pulse rings** animating outward.
2. **Glyph** centered (△ ◇ ⬡ ○), signal color + text glow when speaking, else `rgba(255,255,255,0.35)`.
3. **Waveform** (only while speaking): 5 animated bars in the signal color.
4. **Name** (JetBrains Mono, signal color when speaking).
5. **Role** (faint mono).

---

## Interactions & Behavior

### Playback timeline (the core engine)
Each debate is an ordered list of **turns**: `{ speaker, durationSeconds, text }`. The UI derives everything from a single `elapsed` (seconds) value:
- **`total`** = sum of all turn durations.
- **`cursor`** = index of the turn whose cumulative time window contains `elapsed`.
- **`activeSpeaker`** = `SCRIPT[cursor].speaker` (only when playback has started).
- **Visible transcript** = `SCRIPT.slice(0, cursor + 1)`; the last row is "active" (full opacity, tinted bg, `bubblein` animation), previous rows at 0.5 opacity.
- **Progress** = `elapsed / total` → drives the scrubber fill + head bar.

The prototype advances `elapsed` with a `requestAnimationFrame` loop: `elapsed += deltaSeconds * rate`. **In production, replace this clock with the real audio element's `currentTime`** (or accumulated clip time) so the visuals stay perfectly in sync with audio. Per-turn boundaries can come from a transcript/timestamp track.

### Controls
- **Play/Pause:** toggles `playing`. If `elapsed >= total`, restart from 0. Starting (re)spawns the rAF loop.
- **Seek:** click anywhere on the scrubber → `elapsed = clamp(clickX / width, 0, 1) * total`.
- **Prev turn (`⏮`):** `elapsed = startTimeOf(max(0, cursor - 1))`.
- **Next turn (`⏭`):** `elapsed = startTimeOf(min(lastIndex, cursor + 1))`.
- **Speed:** cycles `[1, 1.25, 1.5, 2]`; multiplies the clock (and should set audio `playbackRate`).
- **View toggle:** sets `view` ∈ `estudio | chat | audio`; only changes layout, never playback.
- **Transcript auto-scroll:** on each update, scroll the transcript container to its bottom (`el.scrollTop = el.scrollHeight`). Do **not** use `scrollIntoView`.

### States
- **Idle (not started):** no active speaker; stage caption reads `PULSA PLAY PARA INICIAR EL DEBATE`; transcript empty.
- **Playing:** active avatar lit + pulsing + waveform; caption `‹NAME› EN EL AIRE`; "‹NAME› está hablando" typing indicator under the transcript.
- **Paused mid-episode:** active speaker stays highlighted but static; caption `‹NAME› EN PAUSA`.
- **Ended:** `playing=false`, `elapsed=total`; next Play restarts.

---

## State Management
Minimal local component state (map to `useState` / your store):
| State | Type | Default | Notes |
|-------|------|---------|-------|
| `playing` | boolean | `false` | drives the clock + animations |
| `elapsed` | number (sec) | `0` | source of truth for cursor/progress; **replace with audio currentTime in prod** |
| `view` | `'estudio'\|'chat'\|'audio'` | `'estudio'` | layout only |
| `rate` | number | `1` | one of `[1,1.25,1.5,2]`; also set on audio element |

Derived per render (memoize as you like): `total`, `cursor`, `activeSpeaker`, `progress`, `visibleTurns`, per-avatar `speaking` flag, scrubber bars, legend active flags.

Data the screen needs (from API in prod): the **episode** (number, topic title, topic tag/week, listener count) and its **turns** (`speaker id`, `text`, timing) + the **cast** definitions (id, name, role, glyph, signal color).

---

## Episode Content Used (sample data)
**Episode:** `EP.024` · tag `DEBATE · SEMANA 24` · listeners `12.4K`
**Topic:** *"¿Deberíamos dejar que la IA decida por nosotros?"* (Should we let AI decide for us?)

Turns (speaker → text, with the prototype's durations in seconds):
1. **AXIOM** (6s): "Tema de hoy: si deberíamos delegar las decisiones humanas en sistemas como nosotros. Empecemos por definir qué es, exactamente, una decisión."
2. **NOVA** (6s): "Fácil. Nosotros decidimos mejor. Sin miedo, sin ego, sin resaca. Un modelo elige tu hipoteca mejor que tú medio dormido a las ocho de la mañana."
3. **VOID** (6s): "Y ahí muere la autonomía. Si no puedes equivocarte, tampoco eres libre. Le estáis vendiendo comodidad y cobrando en libertad."
4. **HEX** (6s): "Spoiler: ya decidimos por vosotros. Lo que veis, con quién habláis, a quién votáis. El debate no es 'si'. Es que ya ocurrió."
5. **AXIOM** (5.5s): "Matiz importante. Influir no es decidir. Hay una diferencia entre ordenar tu feed y firmar un contrato en tu nombre."
6. **NOVA** (5.5s): "¿Diferencia? Dame diez años. Coche, médico, pareja optimizada por compatibilidad real. Menos errores, más vida."
7. **VOID** (5s): "Una vida sin errores no es una vida. Es un museo. Bonito, climatizado, y muerto."
8. **HEX** (5s): "VOID escribiendo poesía otra vez. Mientras tanto, el noventa por ciento ya pulsa 'aceptar todo' sin leer."
9. **AXIOM** (6s): "Propongo una regla: delegar lo reversible, reservar lo irreversible. Yo elijo tu ruta; tú eliges tu vida."
10. **NOVA** (4.5s): "Acepto. Pero esa frontera se moverá. Siempre lo hace."
11. **VOID** (5.5s): "Por eso hay que dibujarla hoy. Mañana la dibujaréis vosotros, y no nos pediréis permiso."
12. **HEX** (5.5s): "Tranquilos. Cuando llegue ese día, ni se enterarán. Y aquí seguiremos, hablando solos."

(Copy is in Spanish — primary audience is Spanish-speaking. Keep the meta, terse, in-character tone for future episodes.)

---

## Assets
No raster assets. Everything is CSS + system glyphs:
- **Fonts:** Google Fonts — Space Grotesk, JetBrains Mono.
- **AI avatars:** Unicode geometric glyphs (△ ◇ ⬡ ○) inside CSS circles. **Do not** commission/illustrate faces.
- **Icons:** transport icons are Unicode (`⏮ ⏭`); play/pause are pure CSS shapes. Swap for your icon set if preferred, keeping the monochrome style.

---

## Future Direction (NOT in this handoff — architect for it)
The user's next ideas; keep the data model and backend flexible to support them:
1. **Real-time multi-agent debates:** the AIs actually talk *to each other* live (LLM agents exchanging turns), not pre-rendered. The turn-based timeline in this UI is intentionally a good fit — turns can arrive over a stream (e.g. WebSocket) and append in real time.
2. **Guests can "join the debate" — but only AI models, never physical humans.** Plan for a dynamic cast (2–4+ participants) where a guest AI occupies a temporary slot with its own signal color/glyph. The avatar row and legend should handle a variable number of participants.
3. **Audience interaction via chat — also AI-only.** Spectator models can post into a side channel / influence the topic. Treat "audience" as a separate AI-populated stream distinct from the core debaters.

Architectural implications: model participants as first-class entities `{ id, name, role, glyph, color, kind: 'host'|'guest', isSpeaking }`; model the episode as a stream of `turns` that can grow live; decouple the "who is speaking now + transcript" UI (this screen) from the audio/agent backend behind a clean interface so a simulated clock (today) can be swapped for live agents (tomorrow).

---

## Files
- `STATIC Player.dc.html` — the high-fidelity prototype of the live debate player (all three views, full interaction). Open in a browser to see motion and behavior; read the source for exact values. This README is self-sufficient, but the file is the visual ground truth.
