# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static site with no build step. It uses plain ES modules, served as-is by GitHub Pages at
`stellamarinedesign.github.io/design-scheduling`.

- **Backend:** Firebase JS SDK 10.12.2 (modular) from the CDN, in the app's own Firebase
  project (Auth email/password + Firestore). SheetJS from the CDN for spreadsheet imports.
- **Install:** works as a home-screen app on iPhone via the web manifest, with no service
  worker.
- **Why this stack:** it was chosen by the owner to match the other Stella web apps (production
  board, material ordering, workshop drawings).
- **Local mode:** with no Firebase config, the app runs without sign-in and keeps its data in
  the browser, for development.

## Users

- **Design lead.** The owner of the app, who runs Stella Marine Group's design and drafting
  work.
  - Does their own design work as well.
  - Assigns jobs to designers, checks their drawings and output, and needs to see everything
    in progress across every category and person at once.
- **Designers.** 2–3 now; design for up to about 10.
  - Do the CAD and drafting work (SolidWorks, AutoCAD): GAs, drawings, laser files, laser
    checklists, build forms.
  - See and manage their own work, post progress updates, and submit work for checking.
- **Contributors.** Workshop staff.
  - Post photo notes about design improvements, issues and ideas from their phones.
  - They see the Log only.
- **Manager contributors** (working name). Sales or management.
  - Also see a read-only Jobs list of the jobs the Design lead chooses to share.
  - Can add questions, customer updates (e.g. a cancellation) or requests on those jobs.
  - They do not manage jobs or tasks.

## Product Purpose

Design Scheduling replaces three tools that each held part of the picture:

- the owner's personal TileDo desktop app (categorised, nested to-dos);
- the shared Drafting Progress Tracker Excel sheet. Its columns were Model, Status, Status
  Notes, Notes (instructions), Checked, and Path;
- a shared Apple Notes folder of design-improvement photos and notes.

**Success means:**

- The design lead can open one page and see what is actually in progress, what needs checking,
  what is waiting on someone else, and what has been sitting untouched.
- Every job stays filed under its product category.
- Design changes are documented with photos where the whole team can find them.

## Positioning

It's built around Stella's own drafting workflow, not a generic project tool:

- **Product categories** such as cylinder lifters, rotary lifters, davits, tender launchers,
  helm chairs, watermakers and doors, plus minor fixes and R&D.
- **Deliverable steps** inside a job: concept, approval, 3D, drawings, laser, build form,
  checked, production.
- **The lead's explicit check loop:** Ready for check → Approve, or Send back to fix with a
  comment.
- **Waiting on another job.** A job that's waiting can name the other job holding it up, and
  unblocks itself automatically when that job finishes.
- **Folder links into the shared "Stella Systems" OneDrive library**, stored relative to that
  root so the same link works on every PC.

## Operating Context

- **Desktop, glanced at between CAD work:**
  - On a second monitor beside SolidWorks or AutoCAD, at full height.
  - Snapped to half of one monitor (about 900px wide), sharing it with SolidWorks, File
    Explorer or Outlook. Layouts must hold up at that width, not just at full desktop width.
- **iPhone, away from the desk:** around the office, on the workshop floor and on boats. Used
  for quick status changes, checking what's waiting, approving, and taking or posting photo
  notes on the spot.
- **Files** live in the "Stella Systems" OneDrive library, which is synced to every PC under a
  different Windows profile path. A browser cannot open File Explorer, so a folder link copies
  the full path for that PC.
- **Neighbouring apps:**
  - The Stella production board and material-ordering apps share the
    `stellamarinedesign.github.io` origin and a future single-login hub.
  - On the board, "jobs" means production orders. That's a different thing, though the same
    people see both apps.
- **History:** the Excel tracker and TileDo data are imported once, in the browser. After that
  this app is the record.

## Capabilities and Constraints

**Terminology (fixed on screen):**

- **Category (group):** a collapsible grouping the user makes anywhere.
  - At the top: master categories such as Production or Programs.
  - Inside other groups: categories, sub-categories.
  - Inside a job: sections of its tasks.

  The structure is user-built and deliberately not hard-coded, because how the work is
  organised is still evolving.
- **Job:** a task whose parent is a group.
- **Task:** anything nested under a job, at any depth.
- **Statuses:** To do, In progress, Waiting, Ready for check, Fix (sent back), Done,
  Cancelled.
- **Roles:** Design lead, Designer, Contributor, Manager contributor (working name).

**Capabilities, delivered in phases:**

1. Your own jobs and tasks, the Home dashboard, folder links, blocking jobs, and the
   TileDo/Excel import.
2. Assignment, the check loop, a team view, designers' Tasks list, the design Log with
   photos, and contributors.
3. Only if the company approves a Microsoft app registration: photos move to OneDrive.
4. A product deliverables register, metrics, and per-PC helpers.

**Constraints:**

- Changing status must be one tap. The owner's TileDo data had only 1 of 124 open tasks marked
  in progress, because changing status cost too much.
- Every action has a visible control that works by touch. Right-click and keyboard shortcuts
  are accelerators only.
- The repository is public. No customer names, vessel names, staff emails, real job data or
  licensed font files may appear in code, fixtures, mockups or examples. Demo content must be
  invented.
- The security rules, not the interface, enforce permissions. Only a Design lead can approve or
  send back.

**Undecided:**

- where photos ultimately live. The paid Blaze plan is not expected to be available, so photos
  start in Firestore (compressed in the browser, team-only). A move to OneDrive through a
  Microsoft app registration is possible later if the company approves one;
- how long a job must sit untouched before it enters the Backlog rotation on Home (default 14
  days);
- the final category list;
- the Firebase project name.

## Brand Commitments

- **Name:** Design Scheduling, for Stella Marine Group.
- **Binding:**
  - It looks like one family with the other Stella apps.
  - The Stella colour tokens in `css/style.css` and the Friz Quadrata headings are fixed, and
    change only with the owner's approval.
  - The brand body face, Sweet Sans Pro, is licensed and is not shipped.
- **Assets:** the logo is at `images/brand/stella-icon.png`. Further logos are in the owner's
  "universal resources" folder, outside the repo.
- **Voice:** plain, direct, workshop-practical. Australian English spelling (colour, organise,
  centre).

## Evidence on Hand

- **Real working data**, private and kept outside the repo in `../handoff/`:
  - TileDo `data.json`: 276 tasks, nested up to 4 deep.
  - The Drafting Progress Tracker workbook: Todo and Progress sheets.

  These show the real shape of the work: how titles are written, how long notes run, and
  how deep the nesting goes. Mockups may mirror that shape but must use invented names.
- **Brand:** the logo at `images/brand/stella-icon.png`.
- **None of the following exist; do not fabricate them:** testimonials, usage metrics or
  outside endorsements.

## Product Principles

1. **Status must cost nothing.** If updating a job takes effort, the dashboard lies. One tap to
   start; posting an update starts it.
2. **Nothing in progress hides.** Work at any depth surfaces on Home with its category and path.
   Nesting organises; it never conceals.
3. **Done means checked.** A designer's work is finished when the Design lead approves it, and a
   send-back always says why.
4. **A tool for glancing, beside CAD.** Prefer density, consistency and scannability over
   expression. The page is read in seconds, between other work.
5. **Works where the work happens.** Half-screen desktop and iPhone are first-class, not
   afterthoughts.

## Accessibility & Inclusion

No formal standard has been set. The working floor is:

- WCAG AA text contrast in both themes (dark Stella and light Workshop);
- 44px minimum touch targets on phone;
- full keyboard operation on desktop;
- reduced-motion respected.

A light theme is available for bright offices and the workshop floor.
