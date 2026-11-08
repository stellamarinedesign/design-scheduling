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
- **Width bands** (provisional; to be confirmed in the first build):

  | Band | Width | Behaviour |
  |---|---|---|
  | Phone | under 700px | One column. The task panel becomes a full-height sheet. Primary actions sit within thumb reach, and there is a floating add button. |
  | Half-screen | 700–1100px | The category sidebar (240px) beside one content column. The task panel (560px) slides over the content rather than squeezing it. |
  | Wide | over 1100px | Home splits into two columns. On very wide screens the task panel can sit beside the list instead of over it. |

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

- **Floating panel** (`box-shadow: 0 12px 40px rgba(0, 0, 0, .5)`): the task side panel, the
  phone bottom sheet, menus, popovers and toasts. In the Workshop theme it softens to
  `rgba(0, 0, 0, .18)`.
- **Scrim** (`rgba(0, 0, 0, .55)`): behind the phone sheet and any blocking dialog.

### Named Rules

**The Floating-Only Shadow Rule.** Nothing at rest casts a shadow. Cards, tiles and rows are
flat. A shadow means "this is above the page and will go away".

## Shapes

- **Corners** are modest and consistent:
  - 8px (`rounded.md`) on buttons, inputs, cards and rows that show a hover fill;
  - 11px (`rounded.lg`) on the larger containers: stat tiles, the side panel's leading
    corners, sheets;
  - full pills (`rounded.pill`) only for status pills and count bubbles.
- **Lines:** 1px hairlines everywhere. The one exception is the 3px Burning Star Red rule under
  the header, and the 3px underline on the active tab.

## Components

Buttons through Motion were written from the tokens ahead of the first build. Tiles onwards
are recorded from the shipped Phase 2 code (`css/app.css`, `js/views/`).

### Buttons

- **Shape:** gently rounded (8px). 36px tall on desktop, 44px at phone widths.
- **Primary:** Upsdell Red fill, white body-strong label. One per view.
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
  Burning Star Red underline. Count bubbles sit beside a tab when something needs attention.
- **Phone:** the same destinations, as a bottom bar with 44px targets.

### Motion

Motion exists only for change of state, following emil-design-eng:

- the side panel and sheet slide in (260ms, ease-out `cubic-bezier(.23, 1, .32, 1)`);
- toasts enter (200ms);
- a status pill cross-fades its colour (120ms).

Nothing animates on load or on hover beyond a colour change. Reduced motion collapses every
duration to 0.

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
  - ⋯ keeps a 44px target by reaching over the gap on its left.
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
  phones). Labels are Muted Ash meta at 600. The pressed segment is Chip Grey with a White label.
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
  Drawings · stops 12:00 for lunch", and who else is timing.
- **Figures:** every task tile, list row and section tile in a tracked job carries its time
  ("1h 20m", meta, tabular numbers). A figure a running timer feeds is In progress blue and
  moves on every ten seconds without a redraw. A task inside a tracked job shows "Time" in its
  property row.
- **Clock mark** on a tracked job's tile, list row and designer row: a 14px clock and the
  recorded total in meta, In progress blue while your own timer runs on it.
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
  stop and task.

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

### Manager Jobs

A read-only list of the jobs the lead has shared: no ticks, no drag, no status menu.

- **Head:** "Jobs" with filter pills (All · In progress · Waiting · Being checked · Done this
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

### Loading, empty and error states

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
  - Two plain lines follow. A refusal by the rules reads "This account is not allowed to see
    it." with what to do (reload, or ask the Design lead). Anything else gives its message and
    "If you are offline, it loads when the connection is back."
  - Then a Reload button.
- **Gone:** something deleted or unshared, opened in the panel, says "Not here any more" or "Not
  shared any more", with a way on (Open the archive).
- **Failed writes:** the warning toast, in plain words ("That did not save: this account is not
  allowed to make that change. Reload to see what you can do now."). A refused post keeps its
  draft.

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
- **Don't** show raw backend errors ("Missing or insufficient permissions") to anyone.
- **Don't** fill Approve red where several checks share a page. On check tiles it is outlined.
