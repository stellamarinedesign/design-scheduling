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

### Named Rules

**The Half-Screen Rule.** Every view is designed and checked at about 900px wide (snapped beside
CAD), as well as at 375px and full desktop. Nothing important may depend on width above 1100px.

**The Glance Rule.** A row's status, owner and age are readable without hovering, expanding or
opening anything.

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

All components here are synthesised from the tokens, ahead of the first build. Re-run
`/impeccable document` after Phase 1 to capture the shipped versions.

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
