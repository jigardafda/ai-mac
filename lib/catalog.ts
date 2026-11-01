/** The apps every new desktop starts with. None of them exist as code until
 *  the user opens them for the first time. Each brief names the real macOS app
 *  to reproduce; the generator is told to match it as closely as it can. */
export type CatalogApp = { slug: string; name: string; description: string; icon: string; size?: { w: number; h: number } };

/** Default and minimum window size per app, close to the real apps' windows. */
export const WINDOW_SIZES: Record<string, { w: number; h: number; minW?: number; minH?: number }> = {
  notes: { w: 1080, h: 680, minW: 720, minH: 400 },
  calculator: { w: 300, h: 500, minW: 232, minH: 360 },
  todo: { w: 940, h: 640, minW: 640, minH: 400 },
  calendar: { w: 1120, h: 720, minW: 760, minH: 480 },
  weather: { w: 1040, h: 680, minW: 760, minH: 520 },
  paint: { w: 1120, h: 720, minW: 640, minH: 420 },
  music: { w: 1140, h: 720, minW: 820, minH: 480 },
};
export const DEFAULT_MIN = { minW: 520, minH: 320 };

export const DEFAULT_APPS: CatalogApp[] = [
  {
    slug: "notes",
    name: "Notes",
    icon: "/icons/notes.png",
    description:
      "Reproduce Apple Notes for macOS. Three panes: a 200px translucent light grey folders sidebar (an 'On My Mac' section with 'All Notes', 'Notes', 'Recently Deleted', each with a yellow folder glyph and a right-aligned grey count), a 260px notes list (rows with a bold 13px title, then on the next line the time in dark text followed by a grey preview, with 10px vertical padding, grouped under 'Today' and 'Previous 7 Days' headers, the selected row a light grey rounded highlight), and the editor taking the rest. One unified 52px toolbar across all three panes: sidebar toggle at the far left, then over the list a 'new note' (square and pencil) button, and over the editor delete (trash), format 'Aa', checklist, table, media (photo), link, share, and a 180px rounded search field at the right; icons 18px, stroke 1.6, evenly spaced 8px apart, grey rgba(0,0,0,0.6). Data model: each note is {id, title, body, updatedAt as an ISO string}; title is always derived from the first line of the text when rendering, the preview from the second line onward (whitespace trimmed, 'No additional text' only when there is none), and dates are formatted from the ISO string with a helper that never prints 'undefined', 'NaN' or 'Invalid Date'. Clicking a list row loads that note into the editor immediately and the editor always shows the selected note; search filters the list and selects the first match; folder counts update as soon as a note is created or deleted; hiding the sidebar gives its width to the editor. Editor: small centred grey date at the top, then the note itself is one editable area where the first line is rendered as a 24px bold title and the rest as 13px body; there is no separate title field or placeholder, the list title is always that first line. Notes autosave as you type with a quiet 'Saved' indicator, search filters the list, delete moves to Recently Deleted. Checklist items are 16px round circles. The selected note has a pale yellow fill when the list is focused. Start with exactly one short welcome note explaining that notes are saved on this desktop; no other sample notes. 'New Folder' with a folder-plus icon sits at the bottom of the sidebar. Yellow #ffd60a for folder icons and the checklist, blue for selection.",
  },
  {
    slug: "calculator",
    name: "Calculator",
    icon: "/icons/calculator.png",
    description:
      "Reproduce the macOS Sequoia Calculator app pixel for pixel in its compact portrait window. The whole window is one dark surface (#1c1c1e), no separate toolbar: a thin 36px top strip holding only a small calculator-mode button at the left (a list glyph that pops a menu with Basic and Scientific) and a small clock glyph button at the right that shows the history panel. Display: the result right aligned in 56px thin white digits (font-weight 200, letter-spacing -0.02em), commas as thousands separators, auto-shrinking for long numbers, with a 13px grey line above it showing the pending expression, 18px right padding. Keypad: a 4 column, 5 row grid of rounded keys (10px radius) with 8px gaps and 10px outer padding; digits dark grey #5a5a5e with 24px white labels, the top row AC / plus-minus / percent in lighter grey #8e8e93 with black labels, the right column operators orange #ff9f0a with 26px white glyphs (the active operator inverted: white key, orange glyph), '0' spanning two columns with its label left aligned, '=' bottom right; keys lighten briefly on press. Keyboard support for digits, operators, Enter, Backspace, Escape, percent. The history panel slides in from the right over the keypad listing past calculations, and Scientific mode adds a block of scientific keys at the left. Calculator has no 'Saved' indicator and no document state; the window content is just the display and the keys.",
  },
  {
    slug: "todo",
    name: "Reminders",
    icon: "/icons/todo.png",
    description:
      "Reproduce Apple Reminders for macOS. Unified 52px toolbar: sidebar toggle and a 200px search field above the sidebar, and above the content pane at the far right a '+' (new reminder) button and a '…' more button. Left sidebar, 250px: a 2 by 2 grid of smart list tiles (Today blue, Scheduled red, All grey, Flagged orange), each a white rounded tile 56px tall with a 26px coloured circle icon top left holding a white SF-style glyph (calendar, clock, tray, flag), the 24px bold count top right and the 13px bold label bottom left; then a 'My Lists' section (Reminders, Work, Personal) with 22px coloured circle list icons and right-aligned grey counts, and '+ Add List' pinned at the bottom. Main pane: the list title in the list's colour at 34px bold with the open count at the right in the same size but grey, reminders as 36px rows with a 20px round outline checkbox that fills in the list colour with a short animation when completed, the 13px title, grey 11px detail text beneath (due date, notes), '!' priority marks before the title and a small flag at the right on flagged items; the empty state is just 'No Reminders' in grey, vertically centred. Clicking empty space in the list starts a new reminder inline; Enter commits that one reminder exactly once and opens the next blank row; a blank row is never counted and disappears on blur; '+' does the same. Each reminder has an 'i' details button opening a popover with notes, a date and a time field, a flag and a priority; natural language in the title such as 'tomorrow' (meaning tomorrow 9:00 AM), 'tomorrow at 3pm', 'tonight', 'next Monday 9am' or 'in 2 hours' is parsed on commit into the date and time and removed from the title, so Scheduled and Today update. A fifth smart tile 'Completed' sits beneath the grid. 'Completed' count with 'Show' / 'Hide' toggle. Drag to reorder. Start with empty lists; no sample reminders. Everything persists.",
  },
  {
    slug: "calendar",
    name: "Calendar",
    icon: "/icons/calendar.png",
    description:
      "Reproduce the macOS Calendar app. Toolbar: a sidebar toggle and '+' on the left, a Day / Week / Month / Year segmented control centred, and '‹ Today ›' plus a search field on the right. Sidebar, 180px: the calendar list first ('Calendars' in 12px semibold sentence case: Home blue, Work green, Personal purple, Birthdays grey, with compact coloured check indicators) and the mini month at the bottom. Month view, built exactly like this: a weekday header row that is its own CSS grid with grid-template-columns: repeat(7, minmax(0, 1fr)), then the day grid as one element with display: grid, grid-template-columns: repeat(7, minmax(0, 1fr)), grid-template-rows: repeat(6, minmax(0, 1fr)), filling the remaining height (the pane is a flex column with the grid at flex: 1 and min-height: 0); 42 cells, never a table, never flex-wrap, never one row per day; the title reads 'November' in bold and '2026' in regular weight at 28px; each day cell with the number top right (today in a filled red circle), timed events shown as a coloured dot followed by the title in dark 11px text and the time in grey at the right, all-day events as pale calendar-coloured bars with dark matching text; Week view: hour rows with 11px hour labels, a thin red current time line, and events as pale calendar-coloured blocks with a 3px solid coloured left edge and dark matching text, title on the first line and the time range on the second only when the block is tall enough; Day view similar; Year view as 12 mini months. Clicking a day or time slot opens a popover to add an event with title, calendar, start and end time, and notes; clicking an event opens an edit popover with delete. Events persist.",
  },
  {
    slug: "weather",
    name: "Weather",
    icon: "/icons/weather.png",
    description:
      "Reproduce the macOS Weather app. The whole window, sidebar and toolbar included, sits on one full-bleed gradient that follows the condition (sky blue #2d8fe0 to #5fb3f0 for clear and partly cloudy, slate grey for cloud and rain, deep navy at night); there are no white or light grey surfaces anywhere. Left sidebar, 230px (hidden under 760px window width, with a toolbar button to show it), a darker translucent band (rgba(0,0,0,0.18)) holding a translucent search field and the saved cities, each a rounded translucent tile with the city name, local time, condition, the current temperature at 28px and H/L. Main pane: the city name at 28px regular weight, the temperature at 104px with font-weight 100, the condition and 'H:35° L:27°' beneath in white at 80% opacity, then cards with a translucent fill rgba(255,255,255,0.12), a 1px border rgba(255,255,255,0.12), 12px radius and white text at full opacity for values and 70% for captions (never pale cyan): 'HOURLY FORECAST' with a small clock glyph, 210px tall, as a scrolling strip of consecutive local hours starting at the current hour, showing the precipitation chance under an hour only when it is 10% or more with condition icons and precipitation chance, '10-DAY FORECAST' with a small calendar glyph, as 46px rows with the weekday, a 28px condition icon, icon, low, a thin dark track with a gradient segment for that day's range and a white dot for the current temperature on today, and the high, then a 2 column grid of small tiles for UV INDEX, WIND, HUMIDITY, FEELS LIKE, VISIBILITY and PRESSURE, each with an uppercase 11px caption and a 24px value. Condition icons as inline SVG in Apple's multicolour style (yellow sun, white cloud, blue drops). Data from the free Open-Meteo API (forecast and geocoding, no key). Mumbai by default; remember the chosen city and the saved list.",
  },
  {
    slug: "paint",
    name: "Freeform",
    icon: "/icons/paint.png",
    description:
      "Reproduce Apple Freeform for macOS with a single open board (no board browser sidebar, no 'Saved' label): an infinite white board with a faint dot grid. On the Mac the tools live in the unified 52px top toolbar, not in a floating palette: at the left a sidebar toggle and the board name 'Untitled Board' as the title with a small chevron, in the centre a group of 28px icon buttons for Sticky Note, Shapes (opens a popover of shapes), Text, Media, Link and a Draw tool; selecting Draw opens a slim secondary strip beneath the toolbar with pen, marker, highlighter, eraser, a colour row (black, blue, red, green, yellow, purple) and a stroke size slider; at the right undo and redo; the zoom percentage menu sits at the bottom left of the canvas like the real app. Canvas drawing with smooth strokes, sticky notes as draggable yellow squares with editable text, shapes with selection handles, panning with space-drag, zoom from the menu. The board (strokes, shapes, notes) persists and reloads.",
  },
  {
    slug: "music",
    name: "Music",
    icon: "/icons/music.png",
    description:
      "Reproduce Apple Music for macOS. The 52px toolbar is the player: transport controls (shuffle, previous, play, next, repeat) at the left in grey 14px glyphs, a centred 'now playing' panel 420px wide and 44px tall with a light grey rounded background holding a 36px artwork square, the title in 12px bold and the artist and album in 11px grey, a thin progress line with elapsed and remaining time, and lyrics, queue and AirPlay buttons at the right, then a volume slider and a search field at the far right. Sidebar, 220px: Home, New, Radio, then a 'Library' section (Recently Added, Artists, Albums, Songs) and 'Playlists', 24px rows, pink glyphs, the selected row a muted light grey fill with dark text (not a pink pill). Main pane: a 'Songs' heading at 34px bold, then a dense table with 24px rows and no artwork column: title, artist, album and time, alternating row shading, thin column dividers and sortable headers, the playing row highlighted pale pink with a small animated bars glyph; the 'Albums' sidebar item shows a grid of rounded artwork cards instead. Artwork is drawn with canvas gradients. The music itself is synthesised with the Web Audio API: a library of 8 generated loops and tones with names, artists and albums, each with a different pattern. Pink #fa2d48 accent. Play state and the queue persist.",
  },
];

export const NEW_APP_SLUG = "new-app";
