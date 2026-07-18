"""Rotating quest content — free, offline, deterministic.

The quests are stable *slots*: their id, stat, xp, cadence and target never
change (so completions, streaks and achievements keep counting). What rotates is
each slot's title + description + steps, picked from a hand-written pool by a
hash of the period — the day for daily/side quests, the ISO week for weekly ones.
Same board all day, a fresh one tomorrow. No storage, no external service, no cost.

Each variant is (title, desc, steps): the desc is the one-line "what", and steps
are the specific "how" — concrete instructions (reps × sets, timed segments,
prompts) so a quest tells you exactly what to do, not just its theme.

Some daily slots also carry a fixed *non-negotiable* core (see ANCHORS): a small
floor prepended to that day's steps and met every day regardless of the variant
(e.g. push-ups + plank on the physical daily). And where a quest is about
learning, it points at a trusted source (see RESOURCES), matched to the variant.

The pools are tuned to the hunter's real interests:
  STR  badminton + strength, plyometrics, home workouts; push-ups/plank floor
  CRE  drawing, music (FL Studio / instruments), photo & video
  SPI  calm, focus, self-reflection, breath & body — a grounded, reflective tone
  CHA  ambivert: deepen 1-on-1s and occasionally reach past the comfort zone
  INT  coding, math from scratch, Japanese (serious study), reading, and the
       wider world (politics, history, geography, science)
  WLT  making money: fundamentals, side income, monetising skills, managing money

Personalisation: if the player sets a focus for an attribute (Settings →
Attribute focus), that attribute's *side quest* becomes their focus for the day.
"""

import hashlib

from . import game
from .models import QuestDef

# slot id -> pool of (title, desc, steps) variants. The seeded content is the
# first entry, so an unrotated read looks like the original quest.
POOLS: dict[str, list[tuple[str, str, list[str]]]] = {
    # ── Daily ────────────────────────────────────────────────────────────────
    "d-train": [  # STR — conditioning, plyo + home strength
        ("Hunter Conditioning", "Quick full-body circuit", [
            "3 rounds: 10 jump squats, 10 push-ups, 20s plank",
            "Rest 45s between rounds",
            "Finish with 1 min jumping jacks",
        ]),
        ("Plyo Burst", "Explosive lower-body plyometrics", [
            "4 sets × 10 jump squats",
            "3 sets × 8 box or step jumps",
            "3 sets × 20s pogo hops · rest 60s between",
        ]),
        ("Home Circuit", "No-equipment home workout", [
            "3 rounds: 12 squats, 10 push-ups, 12 lunges (6/side), 30s plank",
            "Rest 60s between rounds",
        ]),
        ("Legs & Lunges", "Lower-body strength", [
            "4 × 12 bodyweight squats",
            "3 × 10 reverse lunges per leg",
            "3 × 15 calf raises",
        ]),
        ("Explosive Footwork", "Plyo footwork for the court", [
            "5 × 10s split-step into lunge",
            "4 × 20s fast feet (ladder or line)",
            "3 × 6 jump lunges",
        ]),
        ("Push & Core", "Upper body and core", [
            "4 × 8–12 push-ups (scale as needed)",
            "3 × 30s plank",
            "3 × 15 slow bicycle crunches",
        ]),
        ("Jump Rope", "Rope conditioning intervals", [
            "8 rounds: 40s skipping, 20s rest",
            "Mix in high knees or double-unders if you can",
        ]),
    ],
    "d-sketch": [  # CRE — drawing / music / photo / video
        ("Daily Sketch", "20 min of drawing", [
            "5 min warm-up scribbles",
            "15 min on one subject of your choice",
        ]),
        ("Beat Lab", "20 min in FL Studio", [
            "Lay an 8-bar drum groove",
            "Add bass, then one melodic layer",
            "Save the project even if unfinished",
        ]),
        ("Instrument Time", "20 min practice", [
            "5 min warm-up (scales or chords)",
            "10 min on a piece or riff",
            "5 min play freely",
        ]),
        ("Photo Walk", "Shoot with intent", [
            "Take 10 photos of one subject or theme",
            "Vary angle, distance and light each shot",
        ]),
        ("Frame Work", "Film or edit a short clip", [
            "Shoot or pick 20–30s of footage",
            "Make one clean cut and one transition",
        ]),
        ("Gesture Warmup", "Quick figure sketches", [
            "10 × 30s gesture poses",
            "5 min slower structural sketch",
        ]),
        ("Sound Sketch", "Capture a musical idea", [
            "Hum or play a 4-bar melody or loop",
            "Record it before you lose it",
        ]),
        ("Daily Verse", "Write a short poem", [
            "Freewrite 5 min on one image, moment, or feeling",
            "Shape it into a few lines — any form, no rules",
            "Read it aloud once",
        ]),
    ],
    "d-meditate": [  # SPI — calm / focus / reflection / breath
        ("Inner Gate", "10 min meditation", [
            "2 min settling in, eyes closed",
            "6 min following the breath",
            "2 min just sitting",
        ]),
        ("Breath Count", "10 min breath counting", [
            "Count each exhale 1 to 10, then restart",
            "Lost count? Gently begin again at 1",
        ]),
        ("Body Scan", "10 min body scan", [
            "Move attention slowly head → toes",
            "Soften each area as you pass it",
        ]),
        ("Clear Focus", "10 min focused attention", [
            "Anchor on the breath at the nostrils",
            "When the mind wanders, return — that's the rep",
        ]),
        ("Evening Reflect", "5 min journaling", [
            "One thing that went well",
            "One thing on your mind",
            "One thing you're grateful for",
        ]),
        ("Box Breathing", "10 min to settle", [
            "Inhale 4 · hold 4 · exhale 4 · hold 4",
            "Repeat, slow and even",
        ]),
        ("Check-In", "5 min sit", [
            "Ask: how do I feel right now?",
            "Name it, and where you feel it",
            "Let it be — don't try to fix it",
        ]),
    ],
    "d-connect": [  # CHA — ambivert, mostly meaningful connection
        ("Send a Signal", "Reach out to someone", [
            "A quick 'thinking of you' counts",
        ]),
        ("Check In", "Message someone", [
            "Ask how they really are — no agenda",
        ]),
        ("Voice, Not Text", "Call someone", [
            "Actually call — 5 minutes is enough",
        ]),
        ("Say Thanks", "Appreciate someone", [
            "Be specific about what they did",
        ]),
        ("Good Question", "Go past small talk", [
            "Ask about something that matters to them",
            "Follow up on their answer",
        ]),
        ("Make Plans", "Set up seeing someone", [
            "Suggest a day and a thing to do",
        ]),
        ("Share Something", "Send a thing that fits them", [
            "A song, meme, or link that made you think of them",
        ]),
    ],
    "d-read": [  # INT — coding / math / Japanese / reading / the world
        ("Grimoire Study", "20 min in your current book", [
            "Read your current book for 20 minutes",
            "Write one sentence on the idea that stuck",
        ]),
        ("Growth Read", "20 min, a book that grows you", [
            "Read 20 min of a self-help / growth book (e.g. Atomic Habits)",
            "Write the one idea + the single action you'll try today",
        ]),
        ("Code Kata", "20 min hands-on coding", [
            "Pick one small problem: FizzBuzz, reverse a string, or sum a list",
            "Write it from scratch and run it",
            "Refactor it once to read cleaner",
        ]),
        ("Math from Zero", "20 min rebuilding fundamentals", [
            "Pick today's topic: times tables, fractions, %, or basic algebra",
            "Watch that topic's Khan Academy lesson",
            "Do 5 practice problems — redo any you miss",
        ]),
        ("Kanji & Grammar", "15 min Japanese", [
            "Learn 5 new kanji — write each one 3×",
            "Study one Genki grammar point",
            "Write 2 sentences that use it",
        ]),
        ("Kana Drill", "10 min kana", [
            "Drill one kana row (e.g. か き く け こ)",
            "Write each character 5× from memory",
        ]),
        ("Current Affairs", "15 min news", [
            "Read one local and one world story in full",
            "Write one line: who's affected, and why it matters",
        ]),
        ("Into History", "20 min history", [
            "Pick one event or figure (e.g. WWII, the fall of Rome, Rizal)",
            "Read about it, then note one cause and one consequence",
        ]),
        ("Map the World", "15 min geography", [
            "Pick one country",
            "Learn its capital, its neighbours, and one fact",
            "Place it on a map from memory",
        ]),
        ("Science Dive", "20 min science", [
            "Pick one 'how does X work?' (e.g. vaccines, black holes, Wi-Fi)",
            "Read or watch until you can explain it in 2 sentences",
        ]),
        ("Deep Page", "20 min deep reading", [
            "Phone in another room",
            "Read your book for 20 min with no stopping",
        ]),
        ("Problem Set", "20 min practice", [
            "Do 5 problems at your level (math or code)",
            "Redo every one you got wrong until it clicks",
        ]),
    ],
    # ── Weekly ───────────────────────────────────────────────────────────────
    "w-badminton": [  # STR — the badminton raid (kept on-theme for the achievement)
        ("Dungeon Raid: Badminton", "A full badminton session", [
            "10 min warm-up: footwork + gentle rallies",
            "40–60 min games or drills",
            "5 min cool-down stretch",
        ]),
        ("Court Assault", "Singles or doubles session", [
            "5 min shadow-footwork warm-up",
            "Play 45+ min — track what breaks under pressure",
        ]),
        ("Match Play", "Competitive games", [
            "Best-of-3 sets vs a real opponent",
            "After: note one thing that lost you points",
        ]),
        ("Rally Grind", "Long-rally endurance", [
            "Rally to keep it alive — don't smash to win",
            "Aim for 20+ shot rallies for 30 min",
        ]),
        ("Doubles Raid", "Doubles session", [
            "Focus on rotation and covering your partner",
            "Play 45+ min",
        ]),
        ("Open Court", "Get on court", [
            "20 min drills of your choice",
            "20+ min free play",
        ]),
    ],
    "w-hangout": [  # CHA
        ("Party Gathering", "Time with people you like", [
            "Say yes to (or make) a plan",
            "Be present — phone in your pocket",
        ]),
        ("Guild Night", "Hang with your group", [
            "Gather the crew for a couple of hours",
        ]),
        ("Break Bread", "Share a meal", [
            "Eat with someone, no screens",
        ]),
        ("Deep Talk", "A long, real conversation", [
            "Go one layer deeper than usual",
            "Ask, then really listen",
        ]),
        ("New Table", "Put yourself out there", [
            "Join a group activity or meetup",
            "Talk to at least one new person",
        ]),
    ],
    "w-piece": [  # CRE — finish something, any discipline
        ("Finish a Piece", "Complete one drawing", [
            "Sketch → line → shade → detail",
            "Call it done — don't over-polish",
        ]),
        ("Finish a Beat", "Complete a beat or track", [
            "Arrange intro, verse, chorus",
            "Balance the mix, then bounce/export it",
        ]),
        ("Photo Set", "5 finished photos", [
            "Shoot 20+",
            "Cull to your 5 best",
            "Light edit on each",
        ]),
        ("Short Edit", "One short video", [
            "Storyboard 3–5 shots",
            "Film them, then edit to under 60s",
        ]),
        ("Learn a Song", "Play a song end to end", [
            "Break it into sections",
            "Practice slow, then up to tempo",
            "Play it through twice",
        ]),
        ("Full Render", "Take a drawing to finished", [
            "Pick a rough you like",
            "Refine line and values, then final details",
        ]),
        ("Finish a Poem", "Complete one poem", [
            "Draft freely — don't judge the first pass",
            "Revise: cut weak words, sharpen the images, read it aloud",
            "Call it finished",
        ]),
    ],
    "w-tome": [  # INT — a weekly learning milestone (reading is owned by the daily
        # floor + the weekly book review, so this slot is the *other* learning)
        ("Ship Something", "Small coding project", [
            "Pick one tiny scope (e.g. a CLI, a to-do page, a script)",
            "Build it end to end so it actually runs",
            "Commit it to GitHub with a README",
        ]),
        ("Math Milestone", "Finish one Khan Academy unit", [
            "Watch every lesson in one unit",
            "Score 80%+ on its unit quiz",
            "List the 2 ideas that were hardest",
        ]),
        ("Japanese Checkpoint", "One Genki lesson", [
            "Finish one Genki lesson (grammar + reading)",
            "Learn its kanji and vocab — write each 3×",
            "Review the set twice with flashcards (Anki)",
        ]),
        ("Understand the World", "Go deep on one topic", [
            "Pick one topic (e.g. inflation, WWI, plate tectonics)",
            "Read 3 sources on it",
            "Explain it out loud to someone in your own words",
        ]),
        ("Deep Study", "One course section, start to finish", [
            "Finish one full section of a course you're taking",
            "Summarise it in a half-page, in your own words",
        ]),
    ],
    "w-still": [  # SPI — the long sit / weekly reset
        ("Deep Stillness", "30 min meditation", [
            "Set a 30 min timer",
            "Pick one anchor (breath or body)",
            "Stay with it, gently returning",
        ]),
        ("Long Sit", "30 min focused", [
            "Comfortable, upright posture",
            "30 min on the breath",
        ]),
        ("Weekly Reflection", "20 min journaling", [
            "What did I do well this week?",
            "What drained me?",
            "What do I want from next week?",
        ]),
        ("Silent Half-Hour", "30 min stillness", [
            "No music, no phone",
            "Just sit and notice",
        ]),
        ("Reset Session", "30 min decompress", [
            "10 min slow breathing",
            "10 min stillness",
            "10 min quiet, doing nothing",
        ]),
    ],
    # ── Side ─────────────────────────────────────────────────────────────────
    "s-drill": [  # STR
        ("New Technique", "Drill a shot you struggle with", [
            "Pick one weak shot",
            "150 focused reps (feeding or wall practice)",
        ]),
        ("Weak Spot", "Attack the shot you avoid", [
            "Choose the shot you dodge in games",
            "20 min: slow reps → game-speed reps",
        ]),
        ("Plyo Set", "One sharp plyo set", [
            "5 × 5 max-effort jump squats",
            "Full rest between sets — don't rush",
        ]),
        ("Home Strength", "Quick strength top-up", [
            "3 × 12 squats, 3 × 10 push-ups, 3 × 30s plank",
        ]),
        ("Footwork Ladder", "Agility footwork", [
            "5 min ladder drills",
            "5 min shadow footwork to all corners",
        ]),
        ("Grip & Wrist", "Wrist and forearm for smashes", [
            "3 × 15 wrist curls (light weight or band)",
            "2 min racket figure-8s",
        ]),
    ],
    "s-brave": [  # CRE
        ("Beyond the Comfort Zone", "Draw what you avoid", [
            "Pick your avoided subject",
            "20 min, no erasing the first pass",
        ]),
        ("New Sound", "Beat in a new genre", [
            "Pick a genre you don't make",
            "Copy its groove, then twist it",
        ]),
        ("Cover It", "Recreate a beat or riff", [
            "Choose a track you love",
            "Rebuild its main loop by ear",
        ]),
        ("Odd Angle", "Unusual photo/video angle", [
            "Shoot low, high, or through something",
            "10 frames, no eye-level shots",
        ]),
        ("New Medium", "Try an unfamiliar tool", [
            "Pick a tool or app you rarely use",
            "Make one small thing with it",
        ]),
        ("From Imagination", "No reference", [
            "Draw or compose fully from your head",
            "Accept that it'll be rough",
        ]),
        ("Screen Study", "Watch with a creative eye", [
            "Watch a scene or episode",
            "Note one thing about its shots, story, or edit",
        ]),
        ("Poem from a Prompt", "Stretch your writing", [
            "Pick a random word, object, or line",
            "Write a poem you wouldn't normally write",
        ]),
    ],
    "s-nature": [  # SPI — grounded, introspective
        ("Nature Attunement", "Mindful time outdoors", [
            "Walk or sit outside 10 min",
            "Notice 5 things with each sense",
        ]),
        ("Green Hour", "Outside, no phone", [
            "Phone away",
            "15 min just being outdoors",
        ]),
        ("Walk Meditation", "Slow, attentive walk", [
            "Walk slowly",
            "Match your breath to your steps",
        ]),
        ("One Full Breath", "3 min breathing", [
            "Inhale 4s, exhale 6s",
            "Repeat for 3 min",
        ]),
        ("Thought Audit", "5 min writing", [
            "Dump every thought onto paper",
            "Circle the one that matters most",
        ]),
        ("Single-Task", "Full attention on one thing", [
            "Pick one ordinary task",
            "Do it slowly, no multitasking",
        ]),
    ],
    "s-ally": [  # CHA — ambivert mix
        ("New Ally", "A conversation with someone new", [
            "Ask their name and one real question",
            "Listen more than you talk",
        ]),
        ("First Contact", "Start with a stranger", [
            "A comment or question is enough",
            "Keep it light",
        ]),
        ("Ask a Question", "Learn about someone you know", [
            "Ask something you've never asked them",
        ]),
        ("Reconnect", "Reach someone you've drifted from", [
            "Send the message you've been putting off",
        ]),
        ("Listen Fully", "Mostly listen", [
            "Let them talk",
            "Ask follow-ups — don't redirect to you",
        ]),
    ],
    "s-code": [  # INT
        ("Arcane Study: Code", "30 min learning to code", [
            "Follow one freeCodeCamp lesson or docs page",
            "Type every example by hand — no copy-paste",
        ]),
        ("Debug Something", "Fix or refactor", [
            "Find one bug or one messy function in your code",
            "Fix it, then write a test that proves it works",
        ]),
        ("Math Reps", "20 min practice", [
            "Do 10 problems at your current level",
            "Time the last 5 — beat your first-half pace",
        ]),
        ("Japanese Study", "20 min structured", [
            "15 min: one grammar point or 5 kanji (write each 3×)",
            "5 min: flashcard review (Anki or WaniKani)",
        ]),
        ("Read the Docs", "30 min deep on a tool you use", [
            "Pick a tool/language you use (e.g. Python, React, git)",
            "Read one section you've always skipped",
            "Try one thing from it in a scratch file",
        ]),
        ("Explain It", "Learn it, then teach it", [
            "Learn one concept you're shaky on",
            "Write it in your own words in 5 sentences",
        ]),
        ("Down the Rabbit Hole", "Follow your curiosity", [
            "Pick one question that's been nagging you",
            "Read until it clicks, then note the answer in a line",
        ]),
    ],
    # ── Wealth (WLT) ──────────────────────────────────────────────────────────
    "d-wealth": [  # daily — a small money habit: learn, manage, or earn a little
        ("Ledger Study", "Track today's money", [
            "Add up today's spending into categories",
            "Name one expense you could trim this week",
        ]),
        ("Money Class", "10 min learning", [
            "Read or watch one lesson on money, investing, or business",
            "Write the single idea in a sentence",
        ]),
        ("Skill to Sell", "Sharpen an earning skill", [
            "15 min improving a skill people pay for",
            "Note who would pay for it, and roughly how much",
        ]),
        ("Offer Draft", "Package what you make", [
            "Describe one thing you could sell — a beat, edit, photo, or bit of code",
            "Put a price on it",
        ]),
        ("Market Watch", "Understand the game", [
            "Read one business or market headline",
            "Ask: who makes money here, and how?",
        ]),
        ("Budget Tune", "Widen the gap", [
            "Review one spending category",
            "Move a little more toward saving or investing",
        ]),
        ("Value Reps", "Learn the language of money", [
            "Learn one term (compounding, margin, cash flow, runway…)",
            "Explain it in your own words",
        ]),
        ("Micro-Hustle", "One small income action", [
            "Pick one thing you can offer today",
            "List it, pitch it, or post it — actually send it",
        ]),
    ],
    "w-wealth": [  # weekly — one real milestone toward earning
        ("Ship an Offer", "Put something up for sale", [
            "Pick one skill or product (beat, edit, art, code, service)",
            "Write the listing or offer",
            "Post it somewhere buyers can see it",
        ]),
        ("Learn a System", "Finish one money lesson set", [
            "Complete one course section on investing or business",
            "Summarise it in five sentences",
        ]),
        ("Money Review", "Weekly finance reset", [
            "Total this week's income and spending",
            "Set next week's saving or investing target",
        ]),
        ("Chase a Lead", "Make one real move for income", [
            "Reach out to 3 possible clients or buyers",
            "Follow up on anyone who replies",
        ]),
        ("Invest Plan", "Grow what you have — on paper first", [
            "Research one option (index fund, savings, a small venture)",
            "Write your plan down — no rushed decisions",
        ]),
        ("Build the Funnel", "Make your work findable", [
            "Set up or improve one place people find what you do",
            "Add a clear way to pay you or reach you",
        ]),
    ],
    "s-wealth": [  # side — a quick, optional money action
        ("Extra Coin", "One quick earning action", [
            "Spend 15 min toward income",
            "Sell, pitch, apply, or list something",
        ]),
        ("Learn & Earn", "Study a paid skill", [
            "Watch one tutorial on a skill people pay for",
            "Try it once yourself",
        ]),
        ("Declutter for Cash", "Turn stuff into money", [
            "Find one thing you don't use",
            "List it for sale",
        ]),
        ("Price It Right", "Value your work fairly", [
            "Look up what your skill usually charges",
            "Adjust your price to match your worth",
        ]),
        ("Network Node", "Meet someone in the field", [
            "Message one person who earns where you'd like to",
            "Ask one genuine question",
        ]),
        ("Idea Bank", "Capture an income idea", [
            "Write down one way you could make money",
            "Note the first small step to test it",
        ]),
    ],
}

# Per-attribute framing for a personal-focus side quest.
FOCUS_TITLES: dict[str, str] = {
    "STR": "Focused Training",
    "CRE": "Focused Creation",
    "SPI": "Focused Practice",
    "CHA": "Focused Connection",
    "INT": "Focused Study",
    "WLT": "Focused Earning",
}

# Daily non-negotiables: a small fixed core prepended to a daily quest's rotating
# steps, so there's a floor you meet every single day no matter which variant
# shows. Deliberately light — a minimum you never skip, not a second workout. The
# rotating steps are the "and then some". Only the areas below have one; the rest
# (Connect, Creativity) are a single rotating action that is itself the day's one
# commitment, and creativity is better served by variety than a rigid routine.
ANCHORS: dict[str, list[str]] = {
    "d-train": ["10 push-ups (or as many as good form allows)", "30–45s plank"],
    "d-meditate": ["Pause for 5 slow breaths before you begin"],
    "d-wealth": ["Log today's spending — everything in and out"],
}

# Where a quest is about *learning* something, point at a popular, well-trusted
# source. Keyed by the variant's title, so the pointer matches the day's focus.
# The emoji signals the medium: 📖 book · 🎥 YouTube · 🎧 audio/app · 🌐 site.
RESOURCES: dict[str, str] = {
    # STR — technique worth studying
    "Explosive Footwork": "🎥 Badminton Insight (YouTube)",
    "Dungeon Raid: Badminton": "🎥 Badminton Insight (YouTube)",
    "Doubles Raid": "🎥 Badminton Insight (YouTube)",
    "New Technique": "🎥 Badminton Insight (YouTube)",
    "Weak Spot": "🎥 Badminton Insight (YouTube)",
    # CRE — drawing, music, photo/video, film
    "Daily Sketch": "📖 Drawing on the Right Side of the Brain — Betty Edwards",
    "Gesture Warmup": "🎥 Proko (YouTube)",
    "Beyond the Comfort Zone": "🎥 Proko (YouTube)",
    "Finish a Piece": "🎥 Proko (YouTube)",
    "Full Render": "🎥 Proko (YouTube)",
    "Beat Lab": "🎥 In The Mix (YouTube)",
    "Finish a Beat": "🎥 In The Mix (YouTube)",
    "New Sound": "🎥 In The Mix (YouTube)",
    "Cover It": "🎥 In The Mix (YouTube)",
    "Instrument Time": "🌐 musictheory.net",
    "Photo Walk": "🎥 Peter McKinnon (YouTube)",
    "Frame Work": "🎥 Peter McKinnon (YouTube)",
    "Photo Set": "🎥 Peter McKinnon (YouTube)",
    "Short Edit": "🎥 Peter McKinnon (YouTube)",
    "Odd Angle": "🎥 Peter McKinnon (YouTube)",
    "Screen Study": "🎥 Every Frame a Painting (YouTube)",
    "Daily Verse": "📖 A Poetry Handbook — Mary Oliver",
    "Finish a Poem": "🌐 Poetry Foundation (poetryfoundation.org)",
    "Poem from a Prompt": "🌐 Poetry Foundation (poetryfoundation.org)",
    # SPI — meditation
    "Inner Gate": "📖 Mindfulness in Plain English — Bhante Gunaratana",
    "Body Scan": "🎧 Waking Up — Sam Harris",
    "Deep Stillness": "🎧 Waking Up — Sam Harris",
    "Box Breathing": "🎥 Huberman Lab (YouTube)",
    # CHA — people skills
    "Good Question": "📖 How to Win Friends and Influence People — Dale Carnegie",
    "Listen Fully": "📖 How to Win Friends and Influence People — Dale Carnegie",
    "Deep Talk": "🎥 Charisma on Command (YouTube)",
    # INT — code, math, Japanese, the world
    "Growth Read": "📖 Atomic Habits — James Clear",
    "Code Kata": "📖 Automate the Boring Stuff with Python — Al Sweigart",
    "Arcane Study: Code": "🎥 freeCodeCamp (YouTube)",
    "Ship Something": "🌐 The Odin Project (theodinproject.com)",
    "Math from Zero": "🎥 Khan Academy",
    "Math Milestone": "🎥 Khan Academy",
    "Math Reps": "🎥 Khan Academy",
    "Problem Set": "🎥 Khan Academy",
    "Kanji & Grammar": "🎥 Tokini Andy — Genki walkthroughs (YouTube)",
    "Kana Drill": "🌐 Tofugu — hiragana & katakana guides",
    "Japanese Study": "🌐 Tae Kim's Guide to Japanese (guidetojapanese.org)",
    "Japanese Checkpoint": "📖 Genki: An Integrated Course in Elementary Japanese",
    "Into History": "🎥 Crash Course (YouTube)",
    "Understand the World": "🎥 Crash Course (YouTube)",
    "Map the World": "🎥 Geography Now (YouTube)",
    "Science Dive": "🎥 Veritasium (YouTube)",
    # WLT — money
    "Money Class": "📖 The Psychology of Money — Morgan Housel",
    "Ledger Study": "📖 I Will Teach You to Be Rich — Ramit Sethi",
    "Budget Tune": "📖 I Will Teach You to Be Rich — Ramit Sethi",
    "Money Review": "📖 I Will Teach You to Be Rich — Ramit Sethi",
    "Learn a System": "📖 The Simple Path to Wealth — JL Collins",
    "Invest Plan": "📖 The Simple Path to Wealth — JL Collins",
    "Value Reps": "🌐 Investopedia",
    "Market Watch": "🌐 Investopedia",
    "Skill to Sell": "🎥 Ali Abdaal (YouTube)",
    "Offer Draft": "🎥 Ali Abdaal (YouTube)",
    "Micro-Hustle": "🎥 Ali Abdaal (YouTube)",
    "Ship an Offer": "🎥 Ali Abdaal (YouTube)",
    "Build the Funnel": "🎥 Ali Abdaal (YouTube)",
    "Learn & Earn": "🎥 Ali Abdaal (YouTube)",
}


def period_key(cadence: str, day: str) -> str:
    """Weekly quests rotate per ISO week; daily and side rotate per day. Also the
    scope a quest's step-checks belong to."""
    return game.week_key(day) if cadence == "weekly" else day


# Back-compat alias used within this module.
_period_key = period_key


def _pick(slot_id: str, period_key: str, n: int) -> int:
    """A stable index into a pool — same slot + period always maps the same way."""
    digest = hashlib.md5(f"{slot_id}:{period_key}".encode()).hexdigest()
    return int(digest, 16) % n


def floor_for(quest: QuestDef, book: str | None = None) -> list[str]:
    """The mandatory non-negotiable steps for a slot — the floor met every day
    regardless of the day's variant or whether an LLM wrote it. Grow always opens
    with reading a chapter; other daily anchors come from ANCHORS. Empty for
    non-daily slots."""
    anchor = list(ANCHORS.get(quest.id, []))
    if quest.id == "d-read":  # reading a chapter is the mandatory daily floor
        chapter = f"Read a chapter of {book}" if book else "Read a chapter of your current book"
        anchor = [chapter] + anchor
    return anchor


def pool_variant(quest: QuestDef, day: str) -> tuple[str, str, list[str]]:
    """The raw (title, desc, steps) picked from the handcrafted pool for the
    period — no floor applied. Used as the fallback and as a style seed for the
    LLM prompt."""
    pool = POOLS.get(quest.id)
    if not pool:
        return quest.title, quest.desc, []  # unknown slot → seeded fallback
    return pool[_pick(quest.id, _period_key(quest.cadence, day), len(pool))]


def content_for(
    quest: QuestDef,
    day: str,
    focus: list[str] | None = None,
    book: str | None = None,
) -> tuple[str, str, list[str], str]:
    """The (title, desc, steps, resource) a slot should show from the handcrafted
    pool for the period containing `day`, with the mandatory floor prepended.

    `focus` is the attribute's set of focuses; a side quest rotates through them
    day to day. `book` is the player's current book (drives the reading floor).
    `resource` points at a trusted place to learn (empty when there isn't one)."""
    if quest.cadence == "side" and focus:
        pk = _period_key(quest.cadence, day)
        chosen = focus[_pick(quest.id, pk + "|focus", len(focus))]
        title = FOCUS_TITLES.get(quest.stat, "Personal Focus")
        return title, f"Your focus: {chosen}", floor_for(quest, book), ""
    title, desc, steps = pool_variant(quest, day)
    steps = floor_for(quest, book) + steps  # non-negotiables first, then variety
    return title, desc, steps, RESOURCES.get(title, "")
