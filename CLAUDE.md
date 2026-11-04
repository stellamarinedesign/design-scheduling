# Design Scheduling — project notes for Claude

Design Scheduling is Stella's drafting task manager. It is used to:

- assign tasks and track them;
- sort work into categories (any-depth task trees);
- see everything in progress from a Home page;
- run a formal check flow (Ready for check → Approve / Send back);
- keep a photo design log.

It replaces the personal TileDo desktop app and the Drafting Progress Tracker Excel sheet.

**The full plan lives in `../handoff/PLAN.md`.** That covers architecture, data model, rules,
UX and phases. Read it before starting a phase. `../handoff/` is private and sits outside this
repo.

**Open Claude sessions in this folder** (`design-scheduling\Design Scheduling\`), not the
parent. Starting here is what loads this file, the project skills and the Impeccable hook.

## Stack and conventions (same as the production board)

- **No build step.** Plain ES modules, served as-is by GitHub Pages at
  `stellamarinedesign.github.io/design-scheduling`. Firebase JS SDK 10.12.2 (modular), loaded
  from `gstatic`. SheetJS from the CDN for imports.
- **Its own Firebase project.** It is deliberately not the board's project. It moves into a
  hub project later (plan, Phase 4).
  - Collection names come from the one `COL` map in `js/store.js`. Never write a collection
    name anywhere else.
- **Local mode.** An empty Firebase config means no sign-in, data in localStorage, one
  machine. Build and test in local mode; never against live data unless a step needs it.
- **Modules copied from the board.** These are copied, not imported, from
  `../../production-scheduling/Production Scheduling/js/`:
  - `firebase.js`, `auth.js`, `access.js`, `password.js`, `settings.js` and `dialog.js`;
  - `stella-folder.js`, plus the path helpers in `packages.js`.

  Keep their comment style, which explains *why*.
- **Version stamping.** `js/version.js` holds the version. Bump it in every commit that changes
  what ships. The same string is the `?v=` on the stylesheet links and the import map.
  Regenerate the map with `python tools/importmap.py` after adding or removing a module.
- **Security rules** are `firestore.rules`, deployed from this folder with
  `firebase deploy --only firestore:rules`. The rules are the enforcement; hiding controls in
  the UI is tidiness.

## The repo is public

- No customer names, vessel names, staff emails, real task data or brand font files in
  commits.
- Test fixtures are invented. The real TileDo/Excel files stay in `../handoff/`.
- `_config.yml` keeps docs and tests off the live site.
- Imports (TileDo `data.json`, the Excel tracker) are parsed in the browser and written to
  Firestore. Nothing is uploaded anywhere else or committed.

## Behaviour rules worth knowing

- **Groups anywhere.** Categories are not a fixed list. Every node is a `tasks` document with
  `kind: 'group' | 'task' | 'step'`. Steps are light ticks that can nest and mix with real subtasks.
  - Groups can sit at the top (master categories), inside groups (categories,
    sub-categories) or inside jobs (sections).
  - A node's category path, colour and steps template come from its group ancestors.
  - Never hard-code a category, a nesting depth, or a group/task pattern. Details are in
    "Structure change: groups anywhere" in `../handoff/PLAN.md`.
- **Words on screen** (`PRODUCT.md`, "Capabilities and Constraints"):
  - **Category:** a group.
  - **Job:** a task whose parent is a group.
  - **Task:** anything nested under a job.
  - **Roles:** Design lead · Designer · Contributor. In code and the access document they are
    `lead | designer | contributor`.

  The data collection is still `tasks`, for every level.
- **Tabs:** Home · Tasks · Team · Log. The full categorised list is the **Tasks** tab, not
  "Categories". On Home, "Backlog" replaces "Gathering dust". The confirmed layouts are the
  "Home brief", "Tasks brief", "Task panel brief" and "Designer view" at the end of
  `../handoff/PLAN.md`.
- **Designers see a flat "Tasks" list** of what's assigned to them, like the Excel sheet.
  The Tasks tree is the Design lead's view only. That restriction is in the UI; the rules still
  let designers read all tasks.
- **Statuses are fixed:** `todo | in_progress | waiting | check | fix | done | cancelled`
  (`js/status.js`). Only a lead may make check → done/fix.
  - Starting a task is one tap.
  - Posting an update on a To-do task starts it.
- **Waiting** keeps `prevStatus`, and leaving it restores that status. A waiting task can be
  blocked by other tasks (`waiting.blockedBy`). When the last blocker is done or cancelled,
  the task unblocks itself in the same batch, and a reconcile runs on load to catch the rest.
  Cycles are refused.
- **Folder links** are stored relative to `Stella Systems`, using `/` separators. Pasted paths
  are normalised (`js/folders.js`). The full Windows path is rebuilt per PC from a per-device
  prefix.
- **Photos live in Firestore, not Firebase Storage.** The Blaze plan isn't available.
  - Images are resized in the browser and stored as `Bytes` in their own `images` documents,
    under 1 MiB each, with a small thumbnail on the note or update.
  - Everything goes through `js/photos.js`, so the backend can move to OneDrive later.
- **Dates:** calendar days are `YYYY-MM-DD` built from local parts, never instants. Brisbane
  is UTC+10, so an instant loses a day.

## Running and testing

- `python -m http.server 8790`, or the `local` entry in `.claude/launch.json` for the browser
  pane.
- Unit tests: open `/tests/`.
- Node.js is installed only for `npx` (installing and updating skills). The app never needs it.

## Design workflow
- For any UI work, use the impeccable skill. PRODUCT.md and DESIGN.md are the source of truth.
- The Stella tokens in css/style.css and the Friz Quadrata headings are fixed. Never change the fonts, palette or tokens without asking me first.
- This is a production tool, not a marketing site. Favour density, consistency and one-tap actions over distinctiveness.
- After any visible UI change, screenshot in local mode at 375px and desktop width, then run /impeccable audit on the changed view.
- Fix findings that are within the scope of the current task. List everything else for me and don't apply it.
- Before a phase is marked done, run /impeccable harden on each new view: empty, loading, error and long-text states.
- For toasts, the bottom sheet and side-panel motion, use emil-design-eng. Only animate when it communicates a change of state.

## Tooling notes

- **Impeccable** is installed at project scope (`.claude/skills/impeccable`, `.claude/agents`).
  - Its design hook is in `.claude/settings.local.json`, so it applies on this machine only.
  - Update it with `npx impeccable update`.
  - The brand fonts are intentional. If the detector flags them, allow-list them
    (`npx impeccable ignores add-value overused-font "<font>" --reason "Brand font"`); never
    swap them out.
- **Impeccable live mode:** if `/impeccable live` is ever used, start it with
  `IMPECCABLE_LIVE_COPY_AGENT=chat`. Otherwise its Apply button can launch `claude` with
  permission checks bypassed.
- **emil-design-eng** is installed at `.claude/skills/emil-design-eng`, and tracked in
  `skills-lock.json`.
