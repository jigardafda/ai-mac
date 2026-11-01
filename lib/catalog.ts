/** The apps every new desktop starts with. None of them exist as code until
 *  the user opens them for the first time. Each brief names the real macOS app
 *  to reproduce; the generator is told to match it as closely as it can. */
export type CatalogApp = { slug: string; name: string; description: string; icon: string; size?: { w: number; h: number } };

/** Default window size per app, close to the real apps' default windows. */
export const WINDOW_SIZES: Record<string, { w: number; h: number }> = {
  notes: { w: 1080, h: 680 },
  calculator: { w: 340, h: 560 },
  todo: { w: 940, h: 640 },
  calendar: { w: 1120, h: 720 },
  weather: { w: 1040, h: 680 },
  paint: { w: 1120, h: 720 },
  music: { w: 1140, h: 720 },
};

export const DEFAULT_APPS: CatalogApp[] = [
  {
    slug: "notes",
    name: "Notes",
    icon: "/icons/notes.png",
    description:
      "Reproduce Apple Notes for macOS. Three panes: a translucent light grey folders sidebar (an 'iCloud' section with 'All iCloud', 'Notes', 'Recently Deleted', each with a yellow folder glyph and a right-aligned grey count), a notes list in the middle (rows with a bold title, a grey date plus preview line beneath, grouped under 'Today' and 'Previous 7 Days' headers, the selected row with a light grey rounded highlight), and the editor on the right (small centred grey date at the top, the first line rendered as a 24px bold title, 13px body). A 52px unified toolbar across the list and editor with icon buttons: new note (square and pencil), format 'Aa', checklist, table, link, share, and a rounded search field at the right. Notes autosave as you type, the title comes from the first line, search filters the list, delete moves to Recently Deleted. Yellow #ffd60a is the brand accent for folder icons and the checklist, blue is the selection colour.",
  },
  {
    slug: "calculator",
    name: "Calculator",
    icon: "/icons/calculator.png",
    description:
      "Reproduce the macOS Calculator app pixel for pixel. Dark graphite body (#1f1f1f). Display: black area with the result right aligned in thin 46px white digits (font-weight 200), commas as thousands separators, auto-shrinking for long numbers, and a small grey line above it showing the pending expression. A 4 column, 5 row key grid of flat rectangular keys separated by 1px dark lines (no rounding, no gaps): digits mid grey #5e5e5e with white 20px labels, the top row AC / plus-minus / percent in darker grey #434343, the right column operators in orange #ff9f0a with white glyphs (the active operator shows inverted: white key, orange glyph), '0' double width, '=' bottom right. Keys brighten briefly when pressed. Keyboard support for digits, operators, Enter, Backspace, Escape, percent. A 'Paper Tape' panel that slides in from the right listing past calculations, toggled by a small button above the display, and a Basic/Scientific toggle that adds a left block of scientific keys.",
  },
  {
    slug: "todo",
    name: "Reminders",
    icon: "/icons/todo.png",
    description:
      "Reproduce Apple Reminders for macOS. Left sidebar: a 2 by 2 grid of smart list tiles (Today blue, Scheduled red, All grey, Flagged orange), each a rounded light tile with a coloured circle icon top left and a large count top right, then a 'My Lists' section (Reminders, Work, Personal) with coloured dot icons and counts, and '+ Add List' at the bottom. Main pane: the list title in the list's colour at 28px bold with the open count at the right, reminders as rows with a round outline checkbox that fills in the list colour with a short animation when completed, the title, and grey detail text beneath (due date, notes), '!!' priority marks, a flag icon on flagged items. Clicking empty space in the list starts a new reminder inline; '+' at the top right too. 'Completed' count with 'Show' / 'Hide' toggle. Drag to reorder. Everything persists.",
  },
  {
    slug: "calendar",
    name: "Calendar",
    icon: "/icons/calendar.png",
    description:
      "Reproduce the macOS Calendar app. Toolbar: a sidebar toggle and '+' on the left, a Day / Week / Month / Year segmented control centred, and '‹ Today ›' plus a search field on the right. Sidebar: a mini month and the calendar list (Home blue, Work green, Personal purple, Birthdays grey) with coloured rounded checkboxes. Month view: 7 columns with weekday headers, each day a tall cell with the number top right (today in a filled red circle), events as small coloured pills with the time; Week view: hour rows with a thin red current time line and events as coloured blocks; Day view similar; Year view as 12 mini months. Clicking a day or time slot opens a popover to add an event with title, calendar, start and end time, and notes; clicking an event opens an edit popover with delete. Events persist.",
  },
  {
    slug: "weather",
    name: "Weather",
    icon: "/icons/weather.png",
    description:
      "Reproduce the macOS Weather app. Left sidebar: a search field and a list of saved cities, each a small gradient tile with the city name, local time, condition, current temperature and H/L. Main pane: a full-bleed gradient that follows the condition (blue sky for clear and partly cloudy, grey for cloud and rain, deep navy at night), the city name at 28px, the temperature at 96px thin, the condition and H/L beneath, then frosted glass cards: 'Hourly Forecast' as a scrolling strip with condition icons and precipitation chance, '10-Day Forecast' as rows with low-to-high temperature bars drawn against the day range, and a grid of small tiles for UV Index, Wind, Humidity, Feels Like, Visibility and Pressure. Inline SVG icons for conditions. Data from the free Open-Meteo API (forecast and geocoding, no key). Mumbai by default; remember the chosen city and the saved list.",
  },
  {
    slug: "paint",
    name: "Freeform",
    icon: "/icons/paint.png",
    description:
      "Reproduce Apple Freeform for macOS: an infinite white board with a faint dot grid. A floating, centred bottom toolbar with pen, marker, highlighter, eraser, a colour row (black, blue, red, green, yellow, purple), brush size, shapes (rectangle, ellipse, line), text and a sticky note, plus undo, redo and zoom controls at the top right. Canvas drawing with smooth strokes, shapes with selection handles, panning with space-drag, zoom with the controls. The board (strokes, shapes, notes) persists and reloads.",
  },
  {
    slug: "music",
    name: "Music",
    icon: "/icons/music.png",
    description:
      "Reproduce Apple Music for macOS. Sidebar: Home, New, Radio, then a Library section (Recently Added, Artists, Albums, Songs) and Playlists. A centred player bar at the top with a square artwork thumbnail, title and artist, a thin progress line with elapsed and remaining time, transport controls (shuffle, previous, play, next, repeat) on the left and a volume slider on the right. Main pane: 'Songs' as a table with artwork squares, title, artist, album and time, plus an 'Albums' grid of rounded artwork cards. Artwork is drawn with canvas gradients. The music itself is synthesised with the Web Audio API: a small library of 8 generated loops and tones with names, artists and albums, each with a different pattern. Pink #fa2d48 accent. Play state and the queue persist.",
  },
];

export const NEW_APP_SLUG = "new-app";
