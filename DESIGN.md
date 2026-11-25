---
name: Design Scheduling
description: Stella's drafting task manager — a calm console you glance at beside CAD.
colors:
  black-night: "#0e0a0a"
  band: "#1c1c1b"
  shadow-grey: "#282827"
  chip-grey: "#333331"
  rule-grey: "#454542"
  rule-strong: "#5e5e5a"
  text-white: "#ffffff"
  text-ash: "#d2d2ce"
  text-muted: "#b0b0ab"
  upsdell-red: "#af1f24"
  burning-star-red: "#ea372e"
  link-coral: "#ff7369"
  signal-blue: "#3b82f6"
  signal-blue-bg: "#172033"
  signal-blue-text: "#8ab4ff"
  signal-green: "#5fb85f"
  signal-green-bg: "#13261a"
  signal-green-text: "#7fd47f"
  signal-red-bg: "#2b100e"
  signal-amber: "#d97706"
  signal-amber-bg: "#2b1f08"
  signal-amber-text: "#f2b84b"
  signal-violet: "#8b5cf6"
  signal-violet-bg: "#251c45"
  signal-violet-text: "#c4b5fd"
  category-1: "#e0675f"
  category-2: "#e39b4b"
  category-3: "#d4c25a"
  category-4: "#7cc46f"
  category-5: "#4fb8a8"
  category-6: "#5aa5e0"
  category-7: "#8f8de6"
  category-8: "#c47fd6"
  category-9: "#e07fa8"
  category-10: "#a39e93"
typography:
  stat:
    fontFamily: "Sweet Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  headline:
    fontFamily: "Friz Quadrata Pro, Friz Quadrata BT, Friz Quadrata, Georgia, serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Friz Quadrata Pro, Friz Quadrata BT, Friz Quadrata, Georgia, serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Sweet Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.4
  body-strong:
    fontFamily: "Sweet Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.4
  meta:
    fontFamily: "Sweet Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
    fontFeature: "tnum"
  label:
    fontFamily: "Sweet Sans Pro, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  md: "8px"
  lg: "11px"
  pill: "999px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.upsdell-red}"
    textColor: "{colors.text-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-ash}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  input:
    backgroundColor: "{colors.band}"
    textColor: "{colors.text-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  status-pill-progress:
    backgroundColor: "{colors.signal-blue-bg}"
    textColor: "{colors.signal-blue-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-waiting:
    backgroundColor: "{colors.signal-amber-bg}"
    textColor: "{colors.signal-amber-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-check:
    backgroundColor: "{colors.signal-violet-bg}"
    textColor: "{colors.signal-violet-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-fix:
    backgroundColor: "{colors.signal-red-bg}"
    textColor: "{colors.link-coral}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-done:
    backgroundColor: "{colors.signal-green-bg}"
    textColor: "{colors.signal-green-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-todo:
    backgroundColor: "{colors.chip-grey}"
    textColor: "{colors.text-muted}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  task-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-white}"
    typography: "{typography.body}"
    padding: "0 12px"
    height: "44px"
  task-row-hover:
    backgroundColor: "{colors.band}"
  stat-tile:
    backgroundColor: "{colors.shadow-grey}"
    textColor: "{colors.text-white}"
    typography: "{typography.stat}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  side-panel:
    backgroundColor: "{colors.shadow-grey}"
    textColor: "{colors.text-white}"
    width: "560px"
  count-bubble:
    backgroundColor: "{colors.burning-star-red}"
    textColor: "{colors.text-white}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 6px"
  tile:
    backgroundColor: "{colors.shadow-grey}"
    textColor: "{colors.text-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "10px 10px 10px 12px"
    height: "128px"
  tile-selected:
    backgroundColor: "{colors.chip-grey}"
  kids-inset:
    backgroundColor: "{colors.black-night}"
    rounded: "{rounded.lg}"
    padding: "12px"
  child-tile:
    backgroundColor: "{colors.shadow-grey}"
    textColor: "{colors.text-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "6px 4px 6px 6px"
  segmented-on:
    backgroundColor: "{colors.chip-grey}"
    textColor: "{colors.text-white}"
    typography: "{typography.meta}"
    rounded: "{rounded.md}"
    height: "28px"
  callout:
    backgroundColor: "{colors.band}"
    textColor: "{colors.text-white}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  callout-check:
    backgroundColor: "{colors.signal-violet-bg}"
    textColor: "{colors.signal-violet-text}"
  callout-fix:
    backgroundColor: "{colors.signal-red-bg}"
    textColor: "{colors.link-coral}"
  callout-waiting:
    backgroundColor: "{colors.signal-amber-bg}"
    textColor: "{colors.signal-amber-text}"
  note-card:
    backgroundColor: "{colors.shadow-grey}"
    textColor: "{colors.text-white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  kind-chip:
    backgroundColor: "{colors.chip-grey}"
    textColor: "{colors.text-ash}"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  skeleton:
    backgroundColor: "{colors.shadow-grey}"
    rounded: "{rounded.md}"
---

# Design System: Design Scheduling

## Overview

**Creative North Star: "The Wheelhouse"**

Design Scheduling is a console you glance at between other work: on a second monitor beside
SolidWorks, snapped beside File Explorer, or pulled out on a phone on the workshop floor. Like
a wheelhouse at night it is dark and quiet at rest, and the only things that light up are the
things that need you. A job waiting on someone glows amber, work ready for checking glows
violet, a send-back glows red. Everything else stays in greys, so a status change is noticed
the moment the eye lands on the page.

The system belongs to the Stella family: the production board, material ordering and the
workshop drawings app.

- **Shared with the family:** the same Black Night ground, Shadow Grey surfaces, Upsdell Red
  primary action, and the Burning Star Red rule under the header.
- **Different:** the density. This is a working list, not a printed board. Rows are tight,
  labels are small uppercase captions, and numbers line up.
- **Friz Quadrata** names places (the app, each view, each section). The body face does
  everything you read in a row or act on.

Controls are **quiet and exact**: hairline borders, modest 8px corners, outlined secondary
actions, and one filled red button at most per view. Surfaces are flat and told apart by tone.
Only things that float over the page cast a shadow: the task panel, the phone sheet, menus and
toasts. Motion exists only to show that something changed state.

**Key Characteristics:**

- Dark, calm and greyscale at rest. Hue is reserved for signals.
- Dense rows (44px) on a 4/8px rhythm, readable at half-screen width.
- Friz Quadrata for place names; the body face for everything actionable.
- Flat surfaces with tonal layers; shadows only on floating layers.
- One filled primary action per view, in Upsdell Red.
- A light **Workshop** theme exists for bright rooms. It swaps variables only (`css/themes.css`).

## Colors

The palette is near-black and warm grey at rest, with four signal hues for status and a muted
ten-colour set for categories.

### Primary

- **Upsdell Red** (upsdell-red): the Stella brand red. It fills the one primary action in a
  view (Approve, Save, Add job).
- **Burning Star Red** (burning-star-red): the brighter brand red. Used for:
  - the 3px rule under the header;
  - the active-tab underline;
  - the focus ring;
  - count bubbles.

  It never fills a button.

### Secondary

The secondary colours are signal hues, which together are the status language. Each status has
a deep background and a light text tint, used together as a pill.

- **Signal Blue** (signal-blue, with signal-blue-bg / signal-blue-text): In progress.
- **Signal Amber** (signal-amber, with signal-amber-bg / signal-amber-text): Waiting, and the
  ages on Backlog tiles.
- **Signal Violet** (signal-violet, with signal-violet-bg / signal-violet-text): Ready for check.
- **Signal Red**: Fix (sent back). It uses Burning Star Red, signal-red-bg, and Link Coral
  (link-coral) as the text tint.
- **Signal Green** (signal-green, with signal-green-bg / signal-green-text): Done.
- To do and Cancelled carry no hue: Chip Grey with muted text, and a struck-through muted title
  respectively.

### Tertiary

These are the category colours (category-1 to category-10): ten muted hues, assigned to
categories in order. They appear only as an 8px dot beside the category name, and optionally
as a 2px rule on a group's left edge.

### Neutral

- **Black Night** (black-night): the page ground.
- **Band** (band): inputs, row hover, insets.
- **Shadow Grey** (shadow-grey): cards, stat tiles, the side panel, the header bar.
- **Chip Grey** (chip-grey): neutral chips and the To-do pill, one step lighter than Shadow Grey.
- **Rule Grey** (rule-grey): the default 1px hairline.
- **Strong Rule** (rule-strong): secondary-button outlines and dividers that must hold at a
  glance.
- **White** (text-white): titles and primary text.
- **Ash** (text-ash): body copy in panels and secondary text.
- **Muted Ash** (text-muted): metadata, breadcrumbs, timestamps, uppercase labels.
- **Link Coral** (link-coral): links and back actions.

### Named Rules

**The Signal Rule.** Colour at rest is greyscale. Hue appears only when it says something: a
status, a category dot, a count, or the single primary action. If a coloured element carries
no meaning, it goes grey.

**The One Red Rule.**
- Upsdell Red fills at most one button per view.
- Burning Star Red is for lines and markers (header rule, active tab, focus, counts), never a
  filled area larger than a count bubble.

**The Dot-Not-Fill Rule.** Categories are a dot and, at most, a thin rule. They never fill a
row, card or chip, so they can never be mistaken for a status.

**The Word-With-Colour Rule.** Status colour always travels with its word ("Waiting",
"Ready for check"). Colour alone never carries the meaning.

## Typography

- **Headline font:** Friz Quadrata (Friz Quadrata Pro / Friz Quadrata BT, with a Georgia
  fallback).
- **Body font:** Sweet Sans Pro, falling back to the platform UI face (Segoe UI on the PCs, San
  Francisco on iPhone).
- **Mono font:** the system monospace (Cascadia Mono / Consolas / Menlo).

**Character:** a classical, chiselled brand serif names each place, over a plain, neutral UI
face that stays invisible in dense rows. Both brand faces are licensed and never shipped, so
the fallbacks must read well on their own.

### Hierarchy

- **Stat** (700, 24px, 1.1, tabular figures): the numbers in Home's stat tiles only.
- **Headline** (Friz 700, 19px, 1.25): view headings (Home, a category's name, Team, Log). In
  the header the app title uses it uppercase with 0.1em tracking.
- **Title** (Friz 700, 16px, 1.3): section headings inside a view ("In progress", "Needs
  checking").
- **Body strong** (600, 14.5px, 1.4): job and task titles in rows, and button labels.
- **Body** (400, 14.5px, 1.4): descriptions, briefs and update text. Keep to about 70ch in the
  task panel.
- **Meta** (400, 13px, 1.35, tabular figures): breadcrumbs, ages ("3d"), assignee names,
  status pills.
- **Label** (700, 11px, 0.1em tracking, uppercase): field captions and small group labels, in
  Muted Ash.
- **Mono** (400, 13px): folder paths and revision codes (R4).

### Named Rules

**The Friz-for-Places Rule.**
- Friz Quadrata names where you are: the app, the view, the section.
- Anything you can click, edit or scan in a row is set in the body face.
- Never set a job or task title in Friz.

**The Tabular Numbers Rule.** Counts, ages and dates use tabular figures, so columns of
numbers line up and don't jitter as they change.

**The 16px Input Rule.** On phone widths, text inputs are 16px, so iOS never zooms the page on
focus.

## Layout

The layout is a working list, not a gallery: content-first columns on a 4/8px rhythm, with the
spacing scale from sp-1 (4px) to sp-6 (32px).

- **Rows:** job and task rows are 44px tall. Nested tasks indent 20px per level, with a hairline
  guide.
- **Width bands** (as built):

  | Band | Width | Behaviour |
  |---|---|---|
  | Phone | under 700px | One column. The task panel becomes a full-height sheet. Primary actions sit within thumb reach, and there is a floating add button. The category sidebar is a sheet from ☰ with 44px rows. |
  | Half-screen | 700–1099px | One content column, given the whole width. The category sidebar is a drawer behind ☰ (290px), not pinned. The task panel (560px) slides over the content rather than squeezing it. |
  | Wide | 1100px and over | The category sidebar (240px) is pinned beside the content. From 1280px the task panel sits beside the list instead of over it. |

  The sidebar is a drawer at half-screen rather than an icon rail (owner, 2026-11-23):
  categories carry only a colour dot, so a rail would be a column of dots. The categories are
  also one tap away in Tasks.

- **Tile grids:** tiles fill columns of at least 208px with a 12px gap. On phones, two tiles sit
  in a row (10px gap). Ready-for-checking tiles and Log cards need 264px, and a Team column
  300px; each drops to one column on a phone. Log cards keep two columns at half-screen. A tree
  section narrower than 345px holds one column of tiles.
- **Rows on a phone:** wide list rows (Crew and Team lanes, manager Jobs rows, Questions &
  requests) restack into a short top line (status or kind, age, ⋯) over the title at full width, with
  the time bar or stage strip below. Titles may wrap to three lines there; the panel has the rest.
- **Heads on a phone:** a view's filter pills stay on one line and scroll sideways, the search
  drops to its own full-width line, and where the header already names the page the view
  heading is hidden visually (kept for screen readers).

### Named Rules

**The Half-Screen Rule.** Every view is designed and checked at about 900px wide (snapped beside
CAD), as well as at 375px and full desktop. Nothing important may depend on width above 1100px.

**The Glance Rule.** A row's status, owner and age are readable without hovering, expanding or
opening anything.

**The Give-Way Rule.** When a row runs short of room, nothing leaves its box. Things give way in
a fixed order:

1. touch targets narrow first, never below the control as drawn;
2. then text ends in an ellipsis, with the whole words kept in the accessible name or menu;
3. or a fact moves to a second place that has room (a tile's age drops to its foot on phones).

## Elevation & Depth

Flat by default. Depth comes from tone:

- the Black Night ground;
- Shadow Grey surfaces on top of it;
- Chip Grey chips one step lighter;
- 1px Rule Grey hairlines wherever two surfaces meet.

Shadows belong only to layers that float above the page and can be dismissed.

### Shadow Vocabulary

- **Floating panel** (`--shadow-panel`): the task side panel, the phone bottom sheet, menus,
  popovers, dialogs, toasts and the + button. It is three layers: a tight contact shadow, a mid
  one and a long soft one (`0 1px 2px / .3, 0 4px 12px / .25, 0 16px 40px / .4` in black), so
  the edge reads without a hard dark band (owner, 2026-11-23). In the Workshop theme each layer
  softens (`.06`, `.07`, `.12`).
- **Scrim** (`rgba(0, 0, 0, .55)`): behind the phone sheet and any blocking dialog.

### Named Rules

**The Floating-Only Shadow Rule.** Nothing at rest casts a shadow. Cards, tiles and rows are
flat. A shadow means "this is above the page and will go away".

## Shapes

- **Corners** are modest and consistent:
  - 8px (`rounded.md`) on buttons, inputs, cards and rows that show a hover fill;
  - 11px (`rounded.lg`) on the larger containers: stat tiles, the side panel's leading
    corners, sheets, menus;
  - **concentric** where one corner sits close inside another: the inner radius is the outer
    one less the gap. A menu's items are 7px inside its 11px corner and 4px padding; the
    folder row's buttons and the password field's Show are 4px; a segmented switch's end
    segments round 1px inside its outline;
  - full pills (`rounded.pill`) only for status pills and count bubbles.
- **Lines:** 1px hairlines everywhere. The one exception is the 3px Burning Star Red rule under
  the header, and the 3px underline on the active tab.

## Components

Buttons through Motion were written from the tokens ahead of the first build. Tiles onwards
are recorded from the shipped Phase 2 code (`css/app.css`, `js/views/`).

### Buttons

- **Shape:** gently rounded (8px). 36px tall on desktop, 44px at phone widths. Small buttons
  are drawn 30px (36px on a phone).
- **Targets** (2026-11-23): every control can be hit at 36px at desk widths and 44px at phone
  width, whatever size it is drawn. Small buttons, status pills, filter pills, small ⋯ buttons,
  ticks, segments, property values, chips, crumbs, the Progress row names, "+N" and the toast's
  button grow an invisible target round them (an `::after`, the Targets block in `app.css`);
  the drawing does not change. Where they wrap onto a second line the gap between the lines is
  at least what they grow by, and side-by-side ones (segments, a tile's tick) grow up and down
  only, so **no two targets overlap**. This was checked with every target measured at 375px,
  900px and desktop, as each role. Selects and the sidebar sheet's rows are drawn 44px on a
  phone. The exceptions: inline fields in the panel (Due, Rev) stay 32px on desktop, and a
  task tile's pill keeps its drawn 30px on a phone because its tick is right above it.
- **Labels say what happens:** verb and object ("Add row", "Save path", "Import these", "Mark
  waiting"), never a bare Add, Save, Done, Apply or OK. A delete, discard or replace confirm
  names both outcomes ("Delete for good" / "Keep it", "Discard changes" / "Keep editing").
- **Working:** a button that waits says so in its label ("Importing…", "Signing in…") and is
  disabled until it is done.
- **Primary:** Upsdell Red fill, white body-strong label. One per view. On a phone the + button
  steps aside while the view shows its own primary (a welcome block's first step, Progress's
  "Add row"), so only one red button is ever in view.
- **Secondary:** transparent, with a 1px Strong Rule outline and Ash label. This is the default
  for most actions.
- **Ghost:** no outline, Muted Ash label. For low-stakes row actions (Start, Snooze, ⋯).
- **States:**
  - Hover lifts the background one tone (Band) or brightens the primary slightly.
  - Focus shows a 2px Burning Star Red ring, offset 2px.
  - Disabled drops to Muted Ash on transparent.

### Status pills

The signature chip, used wherever status is shown. A deep tinted background with a light text
tint of the same hue, a full pill shape, and meta type with the status word always written
out. Tapping a pill opens the status menu, so changing status is one tap.

The word is in its own span (`ui.js` `pill`), and that span ends in "…" when a row runs short;
the pill itself is never clipped, so its target can reach past its drawn edge.

### Filter pills

The pills over a list (All · Open · Waiting, with counts) are outlined, 30px (36px on a phone).
The pressed one takes Chip Grey with a Strong Rule edge and a White label, as a pressed segment
does; Shadow Grey was the Workshop theme's white on its white ground. On a phone a row that
scrolls sideways (the Log, Design jobs, Progress, and Home's Backlog) fades over its last 24px,
so it is plain there is more, and hides its scrollbar.

### Pickers

A button that opens a choice looks like one at rest: a muted 14px chevron after its value. The
panel's Who, Priority and Managers values have it, as do the field-styled pickers (quick add's
and a new line's "In", the composer's Category and Job) and the Log's Category and Anyone.

### Category dot

An 8px circle in the category's colour, followed by the category name in meta or body-strong.
It never fills, per the Dot-Not-Fill Rule.

### Task row (signature)

A 44px row containing:

- a status pill;
- the title (body-strong, white) with its breadcrumb or subtext underneath (meta, Muted Ash).
  A waiting row shows the reason here, a blocked row shows what it's "Blocked by";
- right-aligned: the assignee's initials, the age (tabular meta), and a ghost ▶ Start or ⋯
  action;
- a chevron, for rows with children, that expands them inline.

Hover fills the row with Band. The selected row (the one open in the panel) holds the Band fill
with its title in White, so selection reads as a lit row, never a coloured edge. Every action shown on hover is also reachable without hover: on touch the
actions sit in the row or in the sheet.

### Cards / Containers

- **Corner Style:** 8px for cards, 11px for stat tiles.
- **Background:** Shadow Grey on the Black Night ground.
- **Shadow Strategy:** none at rest (see Elevation & Depth).
- **Border:** 1px Rule Grey.
- **Internal Padding:** 12px by 16px.

### Inputs / Fields

- **Style:** Band fill, 1px Rule Grey stroke, 8px corners, 36px tall (16px text at phone
  widths).
- **Focus:** the stroke turns Burning Star Red. There is no glow.
- **Error:** Link Coral stroke, with the message in Link Coral meta below the field.
  **Disabled:** Muted Ash text with a dashed stroke.

### Navigation

- **Header:** a Shadow Grey bar with the Stella mark and the uppercase Friz app title, sitting
  on the 3px Burning Star Red rule.
- **Desktop tabs:** text tabs in body-strong Muted Ash. The active tab is White, with a 3px
  Burning Star Red underline.
- **Phone:** the same destinations, as a bottom bar with 44px targets.
- **Counts** (outstanding work: checks waiting, open Log notes, send-backs) are pinned to the
  top corner of what they count, over the end of the tab's word on desktop and the icon's
  corner on a phone, so a tab never moves when its count comes or goes (owner, 2026-11-23).
  Red, because each one needs someone to act; it clears only when the work is done. Over 99
  it reads "99+".

### Motion

Motion exists only for change of state, following emil-design-eng and stella-internal-ux:

- the side panel and sheet slide in (260ms, ease-out `cubic-bezier(.23, 1, .32, 1)`) and out
  (200ms);
- toasts enter (200ms) and leave (150ms);
- menus grow out of the button that opened them (160ms, from `scale(.97)` and transparent,
  `transform-origin` at that button wherever the menu had to move to fit) and go back into it a
  fifth quicker (128ms), taking no clicks on the way out;
- a status pill cross-fades its colour (120ms);
- a refused value (an empty name, a wrong password) shakes its field once, 360ms, as well as
  turning red and saying why;
- a theme switch changes every colour at once: transitions are off for that one frame.

Every duration comes from `--dur-fast`, `--dur` or `--dur-panel` (or a fraction of one), so
reduced motion, which zeroes them, stops all of it. Nothing animates on load or on hover beyond
a colour change. Collapsible groups snap open (each fold redraws its view).

### Tiles

The working unit of Home, Tasks and Team: one task or job per tile, flat Shadow Grey, a 1px
Rule Grey edge, 8px corners, 10px padding (12px on the left) and at least 128px tall (120px on
phones).

- **Top row:** a tick (tasks inside a job only) · the status pill · space · the age (meta) · ⋯ (28px).
- **Then:** the title (body strong, two lines at most, hyphenated between words), the place as a
  category dot and crumb ending in an ellipsis, and a two-line subtext. A send-back reason is in
  Link Coral; a waiting reason is in Signal Amber.
- **Foot:** Start (small, with ▶) on a To-do job, the progress bar with "n/m", and the assignee.
- **Whole tile opens it:** a transparent full-bleed button sits under the content, and the pill,
  tick, ⋯ and Start sit above it. Right-click, long-press and Shift+F10 open the same menu as ⋯.
- **States:** hover raises the edge to Strong Rule (not on touch). The open tile takes a Chip Grey
  fill with a Muted Ash edge. A cancelled tile loses its fill, and its title is muted and struck.
- **Backlog tiles** show "Nd untouched" in amber. On phones they scroll sideways in one snapping
  row, each about 72% of the screen wide.
- **On phones (two tiles to a row):** the top row has about 145px at 375px wide.
  - The age moves to the foot, right-aligned. The top row keeps the tick, the whole status
    pill (8px side padding) and ⋯.
  - ⋯ keeps a 44px target by reaching over the gap on its left, and the tick over the gap on
    its right, each only as far as the pill's edge.
  - Short of room, the tick's touch target narrows first (its 20px box never shrinks). Only
    then does the pill end in "…". Its menu and the tile's accessible name still say the status
    in full.

### Task panel: the "Tasks" inset

A node's children sit in an inset that steps back to the ground (Black Night). Grey tiles on the
panel's own Shadow Grey ran together. It has a 1px Rule Grey edge, 11px corners and 12px padding.
In the Workshop theme the ground is the panel's own white, so the inset takes Band.

- **Heading row:** an uppercase label ("Tasks", or "In this section"), "n of m done" in meta,
  then the Tiles/List switch on the right. Since steps merged into tasks (2026-11-06) there is
  one kind of child: a task, with or without someone on it.
- **Segmented switch:** a 1px Strong Rule outline with 8px corners and 28px segments (34px on
  phones, where icon-only segments are 44px wide). It is not clipped, so its segments' targets
  reach past it; the end segments round their own corners. Labels are Muted Ash meta at 600. The pressed segment is Chip Grey with a White label.
  Each segment has a 14px icon and a word. Inside the inset on phones only the icons show; the
  words stay for screen readers. The choice is remembered per node.
- **Child tiles (Tiles):** the direct children only, one compact tile each, in columns of at
  least 200px (or the full width), with an 8px gap and 6px padding.
  - Top row: a 28px tick column, the title (two lines, weight 600), and ⋯.
  - The subtext and foot indent 32px to sit under the title.
  - The foot shows a pill only when the status says something (not To do or Done), "n/m" when
    it has tasks inside, and the assignee's initials pushed right.
  - Finished children lose the fill and their title is muted. Cancelled ones are struck.
- **Section tiles:** a section is a tile too, on the ground (Black Night) rather than Shadow
  Grey, with a 16px folder icon in the tick column, its name, and "n open" (or "All done",
  "Empty") with "n/m" in the foot. Opening it drills the panel in; things drag into it.
- **List mode:** the whole tree. Rows are at least 38px (46px on phones), laid out as a 28px
  tick, the label and the end actions. Each level indents 28px. Rows are divided by Chip Grey
  hairlines.
  - A task with tasks inside is body strong; done ones turn Ash.
  - Cancelled rows are muted and struck.
  - Section rows carry a folder icon and an uppercase label, as headings.
- **Add a task:** one box, typed straight in. Enter adds and the box keeps focus; "Section"
  sits under it as a small ghost button.
- **Tick:** a 28px target (44px on phones) around a 20px box with 5px corners and a 1.5px Strong
  Rule stroke.
  - Doing: Signal Blue stroke on its tint.
  - Done: an Ash fill with a check.
  - Cancelled: a dashed stroke.
  - The box takes its status hue: sent back (red), waiting (amber), Ready for check (violet).
  - A task with nobody on it and tasks inside shows their state and cannot be ticked itself.
- **Empty:** the dashed empty box. When the category has a tasks template, it offers a small
  "Add the … tasks" button.

### Time tracking (Phase 2.5, milestone 2)

Only on jobs with "Track time" on. Nothing here has a colour of its own: running time is In
progress blue, the warning's edge is Waiting amber.

- **Timer bar** (job panel, under the properties): Start or Pause as a small button (Pause on
  the In progress tint), then the total as a clock icon and figure in body strong with tabular
  numbers (a button that opens the Time log, 44px tall on phones), then a meta line: "On
  Drawings · stops 12:00 for lunch", and who else is timing. A task or job named in the line
  is cut to 30ch with an ellipsis (the whole name is its tooltip), so the stop always shows.
  Start is disabled until this person's running timers have loaded. When the job's entries do
  not load, the total kept on the job stands, and the line says so.
- **Figures:** every task tile, list row and section tile in a tracked job carries its time
  ("1h 20m", meta, tabular numbers). A figure a running timer feeds is In progress blue and
  moves on every ten seconds without a redraw. A task inside a tracked job shows "Time" in its
  property row.
- **Clock mark** on a tracked job's tile, list row and designer row: a 14px clock and the
  recorded total in meta, In progress blue while your own timer runs on it. On a phone the
  tile's age follows it in the foot, after a dot ("106h 55m · 4m"), and that foot wraps
  rather than running out of the tile.
- **The five-minute warning:** a 400px card at the bottom right (full width less the gutters,
  above the tab bar, on phones), Shadow Grey with a Waiting amber edge and 11px corners. The
  head is the clock and the sentence in body strong. Below it are Keep going and Stop now on the
  left and Okay on the right, all small buttons. It rises 8px and fades in over 200ms on the
  strong ease-out, and leaves in 120ms. It never takes focus: the sentence is read out as an
  alert.
- **Time log** (a wide dialog, 760px): the title and job, the total, Add time and Export
  CSV, then days newest first under uppercase day labels with the day's total. Each row is
  start–stop over the length, then the task (body strong) over the person and the record
  ("paused for lunch", "added by Alex, 8 Nov", "edited by you, 9 Nov"), then Edit and a delete
  icon for whoever may change it. Adding and editing open an inset form in place: day, start,
  stop and task. Day headings carry the weekday ("Mon 3 Nov"), so a log running over weeks
  reads by week. The job's name under the title stops at two lines.
  - **An entry whose stop comes before its start** (clocks that disagreed, a hand edit)
    counts as nothing. Its times are in Waiting amber, with a line under the task: "Stops
    before it starts, so it counts as nothing. Edit it to fix." The last sentence is left off
    for someone who cannot edit it.
  - **A refused add or edit** comes back as typed, with "That did not save, so it is back
    here as you typed it." in the form's error line, beside the warning toast.
  - **Not loaded:** the standard error block (heading "The time log did not load"). Offline,
    a line above the days says these are the entries this device holds.

### Time export (2026-11-10)

The lead's, on a job with time tracked: "Export time…" in the job's ⋯ menus and beside Export
CSV in the Time log. It makes a Word document on the uploaded template (the letterhead).

- **The box** (a wide dialog, over the Time log when opened from it):
  - the title and the job (two lines at most), then the date and revision in meta;
  - an Internal | External seg with a one-line hint beside it;
  - for External, Rate ($/h) and an "Add GST (10%)" tick, then Reference for both;
  - **the document's table as it will print:** uppercase column labels over a Strong Rule,
    lines on hairlines, numbers right-aligned in tabular figures, and the totals under a
    Strong Rule with the last one bold. Each line has a tick, in Ash, not brand red, because
    a column of red ticks would break the Signal Rule. A line left out stays listed in Muted
    Ash and leaves the totals;
  - notes in meta (not finished, a timer running, which template, or a Settings link when
    there is none);
  - Download .docx as the one primary action, then Cancel.
  - On a phone the table does not scroll inside the sheet; ticks and buttons are 44px.
- **States:** a skeleton while the times load; the standard error block ("The times did not
  load"); the empty box when nothing is recorded (it points to the Time log when the timer
  cannot start); offline with entries from the cache, the download waits and says why.
- **Settings › Time export:** the template's name, size and who uploaded it, with Replace… and
  Remove (or Upload .docx…), then Default rate ($/h) and Save. A bad file or rate is said in
  Link Coral under it.
- **The document itself** keeps the template's world, not the app's. It has:
  - a small red label in the letterhead's red (`EA282C`);
  - the job's name in the template's Title style;
  - grey uppercase labels;
  - a table ruled in near-black and light grey, with no fills.

### Callouts (task panel)

A callout says where the open task stands and holds what can be done about it. It has 11px
corners, 12px by 14px padding and 10px gaps, in three parts:

- **Head:** meta size at 600, written "what · who · when".
- **Body:** White, wrapping anywhere and keeping line breaks.
- **Acts row:** buttons 8px apart, wrapping.

Neutral callouts (cancelled, dismissed, archived) are Band with a hairline. Status callouts take
their status tint, lose the hairline, and colour the head in the status text tint:

- **Ready for check** (violet).
  - For the lead: Approve (primary, ✓), Send back (outlined), and Take back (ghost, only for
    whoever submitted it).
  - For anyone else: "Waiting for the Design lead to check it." in meta, plus Take back if they
    submitted it.
- **Sent back** (red tint, Link Coral head): the fix note, then Submit for check again (primary)
  and Start fixing.
- **Waiting** (amber): the reason or blocker, then "Stop waiting · back to …" and Change (ghost).
- **Request** (amber): a manager's open note on the job. A note waiting on the lead is amber, as
  anything waiting on someone is. The head is "Question from … · when · n open" (or Update from customer, Request). Then:
  - Cancel job (danger: a Burning Star Red outline and a Link Coral label, never a fill), only
    when the customer has cancelled;
  - Reply, which focuses the update box;
  - Mark answered (ghost).
- **Read-only** (someone else's task, seen by a designer): the same tint, head and body, then a
  meta line saying who has it and that an update can still be posted. There are no buttons.

On phones the panel's bottom dock carries the primary action, and the callout's red button
hides, so one red button stays in view.

### Ready for checking (Home)

The lead's queue, oldest first, as tiles of at least 264px (one column on phones). The heading
has a count bubble. When the queue is empty the section is one line: "Nothing is waiting for your
check."

A check tile is a tile without the minimum height:

- **Top row:** the pill, the time since it was submitted, and ⋯.
- **Then:** the title; the submitter's 22px initials with "name · job · place"; and their latest
  note as subtext.
- **Foot:** Approve (small and **outlined**, never red, since a page of checks would otherwise
  carry several red buttons), Send back (ghost), space, and Open (ghost).

### Crew lanes and the Team tab

- **Lane:** a Shadow Grey card with 11px corners, clipped. Its 44px head holds the person's
  initials, their name (body strong), their counts in meta, and how recently they posted. After
  a few silent days that turns to "Quiet for N days" in amber.
- **Lane row:** 52px tall, in columns: the pill (124px), the title over its subtext, the time
  bar, the age, and ⋯. Rows are divided by Chip Grey hairlines. Hover and the open row take
  Band.
- **Time bar:** an 8px pill-shaped track on Chip Grey. It fills leftwards from "now", and two
  weeks fills it. It is coloured by the status hue (blue, amber, violet or red) and labelled for
  screen readers with the status and duration. A "2 wk · 1 wk · now" axis sits above the lanes
  (hidden on phones).
- **Team tab:** a card per person, at least 300px wide, in auto-fill columns aligned to the top.
  - The head has initials, name, role, and a stack of meta lines: open, done this week and
    month, and checks waiting with the oldest one's age.
  - The body has status bands (an uppercase label, a count and a hairline) of lane rows without
    the bar. To do comes last and folded.
  - A column under a dragged task shows a 2px dashed focus outline.
  - One column on phones.

### The Log

- **Head:** "Log" in Friz. Then filter pills (All · Open issues & ideas · Reference) with
  counts, a search (240px; on phones full width on its own line), and + Note. + Note is small and
  outlined, not red: the one red button in view belongs to the composer or the panel. It reads
  "Note (draft)" when a draft is waiting. On phones the floating + takes its place. A second line holds the category as a lit chip (Shadow Grey, Strong Rule
  edge) that clears it, plus the category and author pickers.
- **Note card:** Shadow Grey with a hairline and 8px corners, clipped.
  - The feed fills columns of at least 264px, and every card in a row is the same height. Half
    screen has two columns. Phones have one, with natural heights.
  - **Photo first:** the first photo is 148px tall (184px on phones), cropped to fill, with a
    hairline under it and a "+N" badge in the bottom corner on a dark translucent pill.
  - **Body** (10px by 12px):
    - a chips row: the kind as a quiet Chip Grey chip, the state pill (Open in amber, Actioned
      blue, Resolved green, Dismissed and Archived outlined), and "Waiting to send" in amber
      while offline;
    - the title (body strong, two lines);
    - the excerpt: three lines under a photo, eight without one (five on phones);
    - the linked job, with a link icon and "+N";
    - a foot of initials, name and age, with the category dot and place pushed right.
  - **States:** hover and open as for tiles. Dismissed and archived cards lose their fill, with a
    muted title.
- **Paging:** "Show older" (small ghost) under the feed. Archived notes fold behind their own
  strip.

### Note composer

A wide dialog (720px). On phones it fills the screen height, text first.

- **Title:** a single-line input, 16px at 600, with the placeholder "Title". It is required,
  takes up to 140 characters, and has focus when the dialog opens.
- **Detail:** a textarea, 16px with 1.45 line height, at least 132px tall (120px on phones),
  with the placeholder "Detail". The two boxes have no visible labels; their accessible names
  are Title and Detail.
- **Keys:** Enter in the title moves to the detail. Ctrl+Enter (or ⌘+Enter) posts from either
  box. Esc closes like Close.
- **Optional fields:** Kind (a segmented Issue · Idea · Reference; 44px equal segments on phones),
  Category (a picker button with a dot and the place), Job (the lead and designers only), and
  Photos.
  - These sit in three columns on desktop, two at half-screen and one on phones.
  - Field captions are uppercase labels.
- **Errors:** a Link Coral meta line above the actions ("Write a title first.").
- **Actions:** Post (primary) and Close, then space, the draft status in meta ("Draft kept on
  this device"), and Discard draft (ghost).
- **The draft is kept:** every keystroke and photo is saved on the device.
  - Close and Esc never ask; a toast says "Draft kept: + Note brings it back".
  - A post the rules refuse puts its words and photos back into the draft.
  - Editing a note that is already posted is different: that is a guarded dialog.

### Photos: tray, thumbnails, lightbox

- **Tray:** 72px squares (80px on phones) with 8px corners, a hairline and Band behind, 6px apart.
  It holds up to 12 photos. Each has a round remove button in the top corner (26px; 36px on
  phones) on a dark translucent disc. While a photo is being resized it shows "Preparing…" in
  micro type. Camera and Photos buttons on touch screens; Add photos, drop and paste on a PC. A box
  under a dragged file shows a 2px dashed focus outline.
- **Thumbnails:** a row of 72px squares (80px on phones). In the note panel they become a grid of
  4:3 tiles at least 140px wide.
- **Lightbox:** a full-screen, near-opaque dark stage in both themes.
  - Its bar holds a tabular "n / m" count, the caption (ending in an ellipsis), and a 44px
    close.
  - Previous and next are 48 × 64px (44 × 56 on phones) on translucent Shadow Grey.
  - It opens on the thumbnail, softened, and swaps in the full photo.
  - ← → and swipe move between photos; Esc or a tap on the stage closes it.
  - It fades in over 150ms, and with no fade under reduced motion.

### Note side panel

The same panel as a task (a full-screen sheet on phones).

- **Top:** the chips row (kind, state, pending), the title in the body face at headline size,
  then the author's initials, name and "when · edited", and a Category property.
- **Body:** the photos grid, then the text (Show all / Show less when long), then the linked jobs
  as rows: a 36px thumbnail or icon, the title over its place, at least 48px tall.
- **Triage** (an open issue or idea, for the lead and designers): an amber callout with Make job
  (small primary), Link to a job, and Dismiss (ghost). On phones Make job and Link to a job move
  to the bottom dock.
- **Dismissed:** a neutral callout with who, when and why, and Reopen.

### Manager Jobs ("Design jobs")

A read-only list of the jobs the lead has shared: no ticks, no drag, no status menu. Its tab and
heading say **Design jobs** (owner, 2026-11-23): managers also read the production board, where
"jobs" are production orders.

- **Head:** "Design jobs" with filter pills (All · In progress · Waiting · Being checked · Done this
  month), a search (220px), and a By category / Full list switch.
- **Category sections:** a toggle with a chevron, the category name in Friz at title size, and a
  count. Each folds, and the fold is remembered.
- **Row:** at least 64px, in columns: the pill (128px), the main column, the stage
  (160–240px), who has it (140px), and the age.
  - The main column holds the title (wrapping), its place in meta, the latest update on one line
    (two on phones), and "A note waiting for an answer" in amber.
  - Half-screen drops the who column. Phones restack it as pill · who · age over the title over
    the stage.
- **Stage strip:** a row of 12 × 6px pills, one per top-level task: done green, doing blue,
  sent back coral, waiting amber, cancelled outlined. A meta line names the current task. Without stage sharing
  the cell says "Stage not shared".
- **Job sheet:** the crumb and the title in the body face, then properties (Who, Rev in mono…).
  - The stage comes next, as a larger strip (20 × 8px) and an ordered list of 40px rows, one
    per top-level task. Each has a round 16px mark, not a box, since there is nothing to tick:
    done is filled green, doing is a blue ring, waiting an amber ring, cancelled is dashed.
  - Last comes "Updates and notes" with the composer.
- **Share with managers** (the lead's ⋯ on a job or group): a menu with an uppercase heading and
  checked choices. "As [the group above]" (with its level as a hint), Not shared, Status only
  (hint: status, latest update, who, age) and Status + stage (hint: and its tasks). The panel's
  properties row says how it is shared and where from.
- **Questions & requests** (lead's Home, above Ready for checking, only when any are open): rows
  of at least 52px.
  - Each row has a kind chip ("Customer cancelled" in amber), the title over "name: note", and
    "age · +N".
  - Then Cancel job (small danger, only for a cancellation), Reply, and Answered (ghost).

### Progress: the design register

The Excel Progress sheet made live (Phase 4, built 2026-11-09; product lines with jobs as rows,
2026-11-19). The lead's tab, and a designer's to read.

- **Structure:**
  - a heading for each category (the sheet's red header line), with its dot, in Friz at view
    size over a hairline;
  - under it, a table for each **product line** (the sheet's bold table title);
  - a row for each job in the line;
  - a cell for each stage or sub-step of the line's tasks template.
- **Head:**
  - "Progress" and "N rows in M product lines · K complete";
  - filter pills (All · Open · Waiting) with counts;
  - Jump to, where there is no pinned sidebar;
  - the lead's "+ Product line".

  On a phone the heading is hidden: the count takes its own line, Jump to and + Product line
  share the next, and the pills scroll sideways, as on the Log. With no lines yet, the welcome
  block offers New product line and the import.
- **Labels row:** stays at the top of the view while its line scrolls by (pulled up by the
  view's own padding, so it sits flush).
  - **The corner**, over the job names, holds:
    - the line's name in Friz at title size;
    - "N rows · M complete";
    - a "Progress only" label when the line is off the Tasks list;
    - the lead's ⋯.
  - **Column labels** stand upright (read bottom to top) in the cells' width, as micro uppercase
    labels in Muted Ash, cut at 104px, with the whole name in the tooltip.
  - **A stage with sub-steps** (Engineering) is a horizontal label in Ash across their columns,
    over a hairline in Strong Rule, with their upright labels below.
  - **A stage that waits on the customer** has a small clock over its label.
- **Row:** 44px.
  - The job's name (body strong, two lines at most) opens it. Under it, a micro label says
    "In Tasks" or "Progress only", but only where the row differs from its line.
  - Then the cells; the done count ("4/7", tabular) with "+N" for tasks outside the columns; the
    revision in mono.
  - The status column:
    - the job's pill (the lead's opens the status menu);
    - while it waits, its age in amber ("9d");
    - who has it;
    - finished, the lead's ghost "Start revision";
    - the lead's ⋯.
  - A cancelled row's name is struck through in Muted Ash.
  - Right-click and long-press open the row's ⋯, and rows drag up and down their line or into
    another (desktop). On touch, Move up, Move down and Move to another line are in the ⋯.
- **Sub-jobs** (2026-11-19) are rows under a row: full jobs of the line, linked by `subOf`.
  - Their names are indented a step a level (20px; 14px on a phone), with a Rule Grey hairline
    down from their row's arrow.
  - The arrow sits in a gutter before every name of the line, so names line up level by level.
  - Folded, a row says "2 sub-jobs · 1 done" in meta under its name. Folds are remembered on the
    device, and rows start open.
  - "Add a sub-job" types in under the row's last sub-row, on Band.
  - With a filter on, a row kept only for a matching sub-row has its name in Muted Ash.
  - The grid is a treegrid then: rows carry `aria-level` and `aria-expanded`.
- **Cell:** the check control's box (22px, 5px corners) in a 36px cell, with a mark for every
  state, since a cell has no word beside it.
  - **Done recedes.** A register is mostly done, so done is a check on a Chip Grey fill, and open
    work is what the eye finds:
    - to do: an empty box outlined in Muted Ash;
    - in progress: a half-filled circle on Signal Blue;
    - Ready for check: a check on Signal Violet;
    - sent back: an exclamation mark on Signal Red;
    - waiting: three dots on Signal Amber;
    - cancelled: a dash in a dashed box.

    The panel's tick, where done is the finish line, keeps its solid done.
  - A column the row has no task for is a 4px point. The lead's click on it offers to add the
    task, in its place, with its stage when that is missing too.
  - A task with tasks inside shows how they stand, and opens rather than ticks.
  - The status word is in each cell's name and tooltip.
- **Fit, per line:** measured against its own width and number of columns, so it holds with the
  panel open beside it as well as at half-screen.
  - **Full:** 36px cells, names up to 360px, the status column takes what is left (at least
    220px).
  - **Compact:** 28–32px cells and narrower name, revision and status columns. With Start
    revision showing, the pill gives way.
  - **Stacked** (a phone): name, revision and status on the first line; the cells on the second,
    under the labels, with the count just past the last cell; every target 44px tall.
- **Add a row:** a row at the foot of a line, on Shadow Grey:
  - the name, "With the N stages" (ticked), and who has it;
  - Add (the view's one primary) and Done.

  It stays open for the next row. A name already in the line is refused in Link Coral under the
  field.
- **The boxes** (`lines.js`), all guarded dialogs:
  - **New product line:** name, category, columns copied from another line or set next, and
    "Show it in Tasks too".
  - **Columns:** stages as bordered blocks on Band, numbered, each with its name, "Waits on the
    customer", Move up, Move down and Remove; its sub-steps indented below it, with + Sub-step
    and + Add a stage.
  - **Next revision:** the revision in mono and who has it. The button names it ("Start R5").
  - **Bringing a job in:** a Match / Keep switch, then a table: each stage and sub-step, a select
    of the job's tasks ("New: to do" first), and the task's status pill now. Below it, "Left
    over", each task to keep as an extra or archive.
- **Performance:** lines out of sight are not laid out (`content-visibility: auto`), so a thousand
  cells redraw in about 25ms.

### Loading, empty and error states

- **Start-up:** `index.html` paints skeleton tiles in the view before any script runs, so a
  cold open on workshop Wi-Fi shows the shape of the page at once, never a blank one; the
  first draw replaces them.
- **Cache first** (2026-11-23): a repeat open takes the access list from the device's copy and
  draws at once; the server's copy is checked straight after (`app.js` `confirmAccess`). The
  same role carries on; a changed role, or an account taken off the lists, starts the app again
  from the server's copy. A copy that lists the person nowhere is never trusted (they may have
  been added since), and Settings' account list always reads the server. The data itself comes
  from Firestore's persistent cache.
- **Saved data:** while the screen shows the device's copy and the server has not answered for
  4 seconds (connected Wi-Fi that goes nowhere), the strip under the header says "Showing saved
  data: the server has not answered yet, so some of it may be out of date." It goes as soon as
  the server answers, with no redraw. Offline, it says "Offline: showing saved data" and that
  changes are kept on this device. Neither is said before there is data on screen.
- **Never a skeleton for ever** (2026-11-25): `js/startwatch.js`, inline in the page, says so in
  a strip under the header after 8 seconds with nothing drawn: "Still loading. If it does not open
  soon, reload the page." with a small **Reload page** beside it; after one reload, "Still not
  loading. Close the app fully, then open it again."; offline, at once, "Offline. The app opens
  when the connection is back." It never reloads by itself, is silent under the hub's card, and
  goes when something real is drawn.
- **Could not start:** an access list that could not be read is an error with **Reload page**
  ("Design Scheduling could not start"), never "Signed in, but not listed yet".
- **A stuck saved copy** (`js/saved-copy.js`): with no answer from it in 4 seconds the page
  reloads once and runs that load without it, waiting for the server. On that load the offline
  strip says to keep the page open, since closing it loses unsent changes.
- **Skeletons:** flat Shadow Grey blocks with a hairline and 8px corners. Each is the size of
  what it stands for: a 128px tile, a 280px note card, a 64px row (inside a list, with only its
  bottom hairline), or a 60px block and a tile in the panel. They do not shimmer. Their container
  carries aria-busy and a "Loading…" label.
- **Empty:** a dashed hairline box in Muted Ash, 16px padding, with any lead phrase in Ash at 600.
  It says what to do next and may offer one small action. A view with nothing in it yet shows a
  welcome block instead: a Friz heading, a line of Ash text at most 62ch, and its actions.
- **Errors:** a block of Ash text at most 62ch wide, with 24px above and below, announced as an
  alert.
  - The heading says what failed, in words: "Your tasks did not load", "The Log did not load",
    "The jobs did not load".
  - Two plain lines follow: why, and what to do. A refusal by the rules reads "This account is
    not allowed to see it." with what to do (reload, or ask the Design lead). Anything else is
    said in plain words from its code (`ui.js` `plainWhy` and `plainNext`): "The server could
    not be reached: offline, or the connection dropped." / "It loads when the connection is
    back. Otherwise reload the page." Firebase's and the browser's own wording is never shown;
    the app's own error sentences are.
  - Then a Reload button.
- **Gone:** something deleted or unshared, opened in the panel, says "Not here any more" or "Not
  shared any more", with a way on (Open the archive).
- **Failed writes:** the warning toast, in plain words ("That did not save: this account is not
  allowed to make that change. Reload to see what you can do now."). A refused post keeps its
  draft, a refused "Add a task" puts the name back in the box, and a refused Keep going or Stop
  now brings the five-minute warning back.
- **Toasts** are as wide as their words, up to 560px or the screen less 16px each side. A name
  inside one is cut to 48 characters, so the toast reads in a glance and its button stays in
  reach.
- **Form errors** mark the field as well as saying why: the field gets a red edge and
  aria-invalid, is described by the error line, takes focus and shakes once (`ui.js`
  `refuse`). Typing clears both.
- **Offline:** whatever would wait for the connection says so at once instead of hanging. A
  workday saved offline is "kept on this device". Convert steps refuses offline, because it
  must read every archived step from the server.

## Stella internal UX (`stella-internal-ux`)

Design Scheduling follows the `stella-internal-ux:stella-internal-ux` skill, the UX laws and
motion rules shared by Stella's internal apps (audited and brought into line 2026-11-23). This
file, PRODUCT.md and CLAUDE.md win where they are more specific; where the skill and this file
disagreed, the owner decided, and the decision is written in place above. How each rule lands
here:

| Skill rule | Here |
|---|---|
| Fitts: 44px at phone width, 36px for desk controls | Targets grow invisibly round the drawn controls; no two overlap (Buttons, "Targets"). |
| Hick: one filled primary per view | One red button; on a phone the + steps aside for a view's own primary. Rare settings live behind the cog. |
| Miller: a row shows status, owner and age | The Glance Rule. Counts on every group and filter. Folder paths have Copy path. |
| Doherty: react within 400ms | Firestore's local writes show at once; a refused write rolls back and says why in the warning toast. |
| Postel: messy in, clean out | Pasted Windows paths and OneDrive links are normalised (`folders.js`); the Excel and TileDo imports read odd captions and blank rows and warn instead of refusing. |
| Tesler: the code absorbs the complexity | The Stella Systems prefix is learnt from the first pasted path; views, folds and Tiles/List are remembered per device. |
| Jakob: keep the replaced tool's words; one meaning per word | The Excel sheet's Progress layout and words; the family header, red primary, status words and local-mode strip. Managers' jobs are "Design jobs". |
| Polish: tabular numbers, balanced text, masked scroll edges, concentric radius, layered shadows | All in place (`app.css`: the Polish block, the phone filter rows, `--shadow-panel`). Hairlines stay the opaque `--border` token: both themes tune it. |
| Badges: 99+, pinned, red only for action | Tab counts. |
| Buttons: verb + object, both outcomes named, working labels | All labels and confirms (Buttons). |
| Loading: paint the shell at once, cache first, say when data might be old | The start-up skeleton; the access list and the data from the device's copy first, checked with the server after; "Showing saved data" when the server does not answer (Loading, empty and error states). |
| Errors: what, why, what next; never raw | `plainWhy` / `plainNext` in every error line and toast. |
| Navigation: links go somewhere, buttons fold; a second signal for the current item | Sidebar links are `<a href>`, folds are `<button aria-expanded>`; the current item is bold, the active tab underlined. Half-screen keeps the drawer (Layout). |
| Dropdowns: look clickable, flip at the edge, keys, search in long lists | Chevrons on pickers; menus flip above, take arrows, Home/End and type-to-jump; pickers search. |
| Motion | As in Motion above: 120–260ms, from the tokens, ease-out entrances, zero under reduced motion. |

**Still open** (not done in the 2026-11-23 pass, each its own change):

- Collapsible groups snap open; the skill would animate their height (≤200ms). Each fold
  redraws its whole view, so they would first have to fold in place.
- Long sidebar names wrap to two lines rather than one line and an ellipsis (kept: two lines
  read better at 240px).
- Saves confirm with a toast rather than the button's own label ("Saved") and one pulse.

## Do's and Don'ts

### Do:

- **Do** keep the screen greyscale at rest and let the status hues carry meaning (the Signal
  Rule).
- **Do** write the status word inside every status pill. Colour is never the only signal.
- **Do** keep job and task rows at 44px. Use tabular figures for every count, age and date.
- **Do** check every view at 375px, about 900px (half-screen) and full desktop before calling
  it done.
- **Do** use the Floating panel shadow only on layers that float and dismiss: panel, sheet,
  menu, popover, toast.
- **Do** show focus as the 2px Burning Star Red ring, offset 2px, on every interactive element.
- **Do** set folder paths and revisions in the mono face.
- **Do** let a crowded row give way in order: touch targets first, then an ellipsis, or move a
  fact to a second place (the Give-Way Rule). Nothing pokes out of its tile.
- **Do** put tiles on a surface one tone away from their own. Inside the grey panel, children
  sit on the ground.
- **Do** say load errors and refusals in plain words, with what to do next, and keep what
  someone typed when a post is refused.
- **Do** give a new small control its target in the Targets block of `app.css`, and check that
  no two targets overlap at 375px, 900px and desktop.
- **Do** name a button for what it does, and both outcomes in a delete or discard confirm.
- **Do** check new UI against `stella-internal-ux:stella-internal-ux` as well as this file.

### Don't:

- **Don't** change the Stella tokens in `css/style.css` or the Friz Quadrata headings without
  the owner's approval.
- **Don't** fill more than one button per view with Upsdell Red. Never fill an area with
  Burning Star Red beyond a count bubble.
- **Don't** fill rows, cards or chips with category colour. Categories are dots.
- **Don't** put shadows on cards, tiles or rows at rest.
- **Don't** hide an action behind hover or right-click alone. Every action needs a visible,
  touchable control.
- **Don't** animate anything that isn't a change of state, and never on page load.
- **Don't** set job or task titles in Friz Quadrata. Don't ship the licensed font files.
- **Don't** show raw backend errors ("Missing or insufficient permissions") to anyone: pass
  them through `plainWhy`.
- **Don't** clip a control that has a grown target (`overflow: hidden` on it or its row cuts
  the target off): clip an inner span instead, as the status pill does.
- **Don't** write a movement's duration as a literal: use a motion token, so reduced motion
  stops it. (The lightbox's fade has its own reduced-motion rule; the sidebar's flash is a
  colour fading out, which reduced motion keeps.)
- **Don't** fill Approve red where several checks share a page. On check tiles it is outlined.
