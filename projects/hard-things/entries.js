// ============================================================
//  FIELD LOG — DATA
//
//  Two parts:
//
//  1) THE DECK (challenges) — standing hard tasks. They never
//     expire; every midnight all stamps reset because "done"
//     only ever means "done TODAY".
//       id       short unique slug, never change it once used
//       title    the challenge
//       category "MIND" | "BODY" | "DISCIPLINE" (or your own)
//       grade    1–5, how hard it is (5 = summit)
//       rules    what counts as a completion
//       margin   optional handwritten scribble on the card
//
//  2) THE LOGBOOK (completions) — the permanent record.
//     One line per challenge per day:
//       { date: "YYYY-MM-DD", id: "<challenge id>" }
//     Optional: note: "..." (shows handwritten in The Record)
//
//     Stamping a card on the page saves the completion in that
//     browser's localStorage immediately. To make it permanent,
//     use the COPY button in the "pending transcription" box on
//     the page and paste the lines at the top of the logbook
//     below, then commit + push.
//
//  NOTE: the logbook below is sample data — replace with real.
// ============================================================

window.FIELD_LOG = {
    operative: "E. Janus",
    operation: "Reclaim the reward system",
    started: "2026-07-01",

    challenges: [
        {
            id: "read-one-sitting",
            title: "Read a book in one sitting",
            category: "MIND",
            grade: 4,
            rules: "One book, one chair, phone in another room. No breaks longer than a coffee.",
            margin: "the long-form muscle"
        },
        {
            id: "no-phone-morning",
            title: "No phone until noon",
            category: "DISCIPLINE",
            grade: 3,
            rules: "From waking until 12:00 the phone stays untouched. Alarm clock counts as furniture, not phone.",
            margin: "mornings are mine"
        },
        {
            id: "run-5k",
            title: "5K before 08:00",
            category: "BODY",
            grade: 3,
            rules: "Five kilometres, finished before eight. Weather is not a variable.",
            margin: ""
        },
        {
            id: "gym",
            title: "Gym session",
            category: "BODY",
            grade: 2,
            rules: "Show up, do the programme. Half-hearted still counts — skipping doesn't.",
            margin: ""
        },
        {
            id: "cold-shower",
            title: "Cold shower — 3 minutes",
            category: "BODY",
            grade: 3,
            rules: "Fully cold, three full minutes. Gasping is permitted.",
            margin: ""
        },
        {
            id: "deep-work",
            title: "90 minutes of deep work",
            category: "MIND",
            grade: 3,
            rules: "One task, one timer, notifications off. The timer does not pause.",
            margin: ""
        },
        {
            id: "no-screens-night",
            title: "No screens after 22:00",
            category: "DISCIPLINE",
            grade: 3,
            rules: "After ten: paper, people, or sleep. The feed will survive without me.",
            margin: ""
        },
        {
            id: "social-media-fast",
            title: "24h social media fast",
            category: "DISCIPLINE",
            grade: 5,
            rules: "A full day without any feed. Checking 'just for a second' voids the day.",
            margin: "the summit"
        }
    ],

    logbook: [
        { date: "2026-07-12", id: "read-one-sitting", note: "Four hours, one chair. Brain kept reaching for a scroll that wasn't there." },
        { date: "2026-07-11", id: "run-5k" },
        { date: "2026-07-10", id: "no-phone-morning", note: "Morning felt about three hours longer than usual." },
        { date: "2026-07-08", id: "gym" },
        { date: "2026-07-07", id: "social-media-fast", note: "The big one. Muscle memory kept opening the empty spot on the home screen." },
        { date: "2026-07-05", id: "deep-work" },
        { date: "2026-07-03", id: "cold-shower", note: "Screamed internally. Possibly externally." },
        { date: "2026-07-01", id: "no-screens-night", note: "The expedition begins." }
    ]
};
