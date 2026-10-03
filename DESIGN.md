# ClubHub Design System

A reference for all subsequent UI work. Styling-only — no behavior changes.

## Audience & feel

Teenagers and young adults in volunteer/leadership clubs, mostly on phones.
Organized and a little energetic — not corporate, not childish.

The one memorable thing: the member's service-hours number — large, in the
display face, with an accent-colored progress bar. Everything else stays
quiet so that number and the club's accent color carry the personality.

## Color tokens

| Role | Light | Dark |
|---|---|---|
| Canvas (page) | `#F5F6F8` | `#0F1216` |
| Surface (cards, sidebar) | `#FFFFFF` | `#171B21` |
| Ink | `#12161C` | `#ECEEF1` |
| Muted ink | `#5B6470` | `#98A1AE` |
| Line | `#E3E6EB` | `rgba(255,255,255,.08)` |
| Subtle fill | `#EEF0F3` | `#1F242C` |
| Club accent (default) | `#0B8A5F`, overridden per club | lightened ~10% |

### Semantic status

| Role | Light | Dark | Notes |
|---|---|---|---|
| Danger | `#C2362E` | lighter | each has `-subtle` (tinted bg) + `-foreground` |
| Warning | `#B26A00` | lighter | |
| Info | `#2563A8` | lighter | |
| Success | `#1F7A4D` | lighter | deliberately NOT the club accent — "approved" must read the same regardless of club |

`--club-ink`: the club accent darkened until it has 4.5:1 contrast on the
surface. Use it for accent-colored TEXT (not the raw accent, which can fail
contrast on light surfaces with light club colors).

Text on the accent picks black or white by luminance (see `club-accent-provider.tsx`).

## Type

- **Display face**: Bricolage Grotesque (600/700) → `--font-display`. Used only
  for `.text-page-title` and `.text-numeral` (44px, tabular-nums).
- **Body face**: Geist Sans → `--font-sans`. Everything else.

Scale (px): **12 / 14 / 16 / 20 / 28 / 44**. Body is 14px, 1.5 line height.
Nothing below 12px. Sentence case everywhere — no uppercase labels.

## Shape

| Element | Radius |
|---|---|
| Controls (buttons, inputs, selects) | `rounded-md` (8px) |
| Cards, panels, dialogs | `rounded-xl` (12px) |
| Avatars, pills | `rounded-full` |

Nothing else. No `rounded-2xl`. `--radius = 0.5rem` (8px) drives the scale.

## Depth

1px borders, not shadows. Shadows appear ONLY on:
- popovers / dropdowns
- dialogs
- dragged items (kanban)

Remove `shadow-sm` / `shadow-md` / `shadow-lg` from static cards.

## Motion

None on page load. Motion only answers an action:
- a task checking off
- a sheet/dialog opening
- the hours progress bar filling once on first dashboard load

Respect `prefers-reduced-motion` (disable all non-essential animation).

## Layout

- Lists over cards. Hairline-separated rows are denser and easier to scan
  than card-per-item grids. Cards are kept for kanban columns and a few
  summary panels.
- Shell: flat 232px sidebar (surface, one right border, no floating card),
  collapsing to a 64px icon rail on tablets. Top bar holds page title, search,
  notifications, avatar. Club switcher at the top of the sidebar.
- Mobile: single column + bottom tab bar (Dashboard, Tasks, Chat, Meetings,
  More).

## Status chips

Subtle tinted background (~0.95 lightness light / ~0.25 dark), 12px medium
text, optional 6px status dot. No saturated fills.
