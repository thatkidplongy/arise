"""Rotating quest content — free, offline, deterministic.

The quests are stable *slots*: their id, stat, xp, cadence and target never
change (so completions, streaks and achievements keep counting). What rotates is
each slot's title + description + steps, picked from a hand-written pool by a
hash of the period — the day for daily quests, the ISO week for weekly and side.
Same board all day, a fresh one tomorrow. No storage, no external service, no cost.

Each variant is (title, desc, steps): the desc is the one-line "what", and steps
are the specific "how" — concrete instructions (reps × sets, timed segments,
prompts) so a quest tells you exactly what to do, not just its theme.

Some daily slots also carry a *non-negotiable* floor (see FLOORS): a small core
prepended to that day's steps and met every day regardless of the variant (e.g.
push-ups + plank + an explosive core slam on the physical daily). The floor is *leveled* — it starts
gentle and climbs as the hunter shows up consistently (see progression.py), so
there's no stagnation. Where a quest is about learning, it points at a trusted
source (see RESOURCES), matched to the variant.

Progression also shapes the *variety* where "harder" isn't a number: each level
maps to a content band (0 foundation → 1 building → 2 depth, see TIER), and the
pool picks from the band that fits where the hunter is. Fundamentals come before
the complicated stuff — learn-how-to-learn before domains, principles before
tactics.

The pools are tuned to the hunter's real interests:
  STR  badminton + strength, plyometrics, home workouts; push-ups/plank/core floor
  CRE  drawing, dance, singing, music (FL Studio / instruments), photo & video
  SPI  calm, focus, self-reflection, breath & body — a grounded, reflective tone
  CHA  ambivert: deepen 1-on-1s and occasionally reach past the comfort zone
  INT  learn-how-to-learn first, then math from scratch, Japanese, and the wider
       world (politics, history, geography, science); reading is the daily floor
       (a chapter, at a pace that climbs with level)
  WLT  making money: money psychology & fundamentals first, then managing, then
       earning — side income, monetising skills
  CFT  the engineering craft, toward Senior: fluency & fundamentals → patterns &
       problem-solving → system design & architecture; a small deep-work floor
       daily, and an interview-mode toggle (INTERVIEW_POOLS) for DSA/mock prep

Personalisation: if the player sets a focus for an attribute (Settings →
Attribute focus), that attribute's *side quest* becomes their focus for the day.
"""

import hashlib

from . import game, progression
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
    "d-sketch": [  # CRE — drawing / music / singing / dance / photo / video
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
        ("Move Practice", "20 min learning to dance", [
            "5 min warm-up: roll through neck, shoulders, hips, ankles",
            "10 min drilling one move or an 8-count — slow, then up to speed",
            "5 min freestyle to a song you love",
        ]),
        ("Rhythm & Groove", "Find the pocket", [
            "Pick one song and count the beat out loud",
            "Practise a simple bounce or groove on every count",
            "Add one move on the offbeat",
        ]),
        ("Sing Practice", "15 min of singing", [
            "5 min warm-up: lip trills and gentle scales",
            "Sing through a song section, matching the pitch",
            "Record one take and listen back for one thing to fix",
        ]),
        ("Pitch & Control", "15 min voice training", [
            "Run scales slowly up and down your comfortable range",
            "Hold steady notes — even tone, steady breath",
            "Try one clean interval jump (e.g. do → sol)",
        ]),
        ("Memorise a Song", "Learn a song by heart", [
            "Pick a song you love — a rap verse counts, and the wordier the better",
            "Break it into lines; learn one small chunk at a time, looping the track",
            "Perform it from memory with no lyrics on screen — stumbles are fine",
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
    "d-read": [  # INT — learn-how-to-learn → domains → the world (reading is the floor)
        # Foundation: the craft of learning itself, before any hard domain.
        ("Active Recall", "Learn by testing yourself, not re-reading", [
            "Read or skim one short piece (or yesterday's notes) for 5 min",
            "Close it and write everything you remember, from memory",
            "Open it back up and fill the gaps you missed",
        ]),
        ("Mind Map", "Connect a new idea to what you already know", [
            "Take one thing you learned recently; write it in the centre of a page",
            "Branch out the ideas it connects to",
            "Draw one line to something you already knew — that link is the memory",
        ]),
        ("Feynman It", "Explain it simply to find the gaps", [
            "Pick a concept you only half-understand",
            "Explain it out loud in plain words, like teaching a 12-year-old",
            "Notice where you stumble — that's the gap; go relearn just that bit",
        ]),
        ("Learn How to Learn", "10 min on the craft itself", [
            "Watch or read one lesson on a learning technique (spacing, chunking, interleaving)",
            "Try it once, today, on something small you're studying",
        ]),
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
        ("Learn a Routine", "Nail a short dance routine", [
            "Break a 30–60s routine into 8-counts",
            "Drill each section slow, then up to tempo",
            "Run it full-out to the music, twice",
        ]),
        ("Perform a Song", "Sing one song fully", [
            "Pick a song in your range and learn the melody",
            "Practise the tricky bits slow, then at full speed",
            "Sing it through twice — keep the better take",
        ]),
    ],
    "w-tome": [  # INT — a weekly learning milestone (reading is owned by the daily
        # floor + the reading check-in, so this slot is the *other* learning)
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
        ("New Technique", "150 reps of a shot you struggle with", [
            "Pick one weak shot",
            "150 focused reps (feeding or wall practice)",
        ]),
        ("Weak Spot", "20 min on the shot you avoid in games", [
            "Choose the shot you dodge in games",
            "20 min: slow reps → game-speed reps",
        ]),
        ("Plyo Set", "5×5 max-effort jump squats, full rest", [
            "5 × 5 max-effort jump squats",
            "Full rest between sets — don't rush",
        ]),
        ("Home Strength", "3 rounds: squats, push-ups, plank", [
            "3 × 12 squats, 3 × 10 push-ups, 3 × 30s plank",
        ]),
        ("Footwork Ladder", "10 min ladder + shadow footwork", [
            "5 min ladder drills",
            "5 min shadow footwork to all corners",
        ]),
        ("Grip & Wrist", "Wrist curls + racket figure-8s", [
            "3 × 15 wrist curls (light weight or band)",
            "2 min racket figure-8s",
        ]),
    ],
    "s-brave": [  # CRE
        ("Beyond the Comfort Zone", "20 min drawing a subject you avoid", [
            "Pick your avoided subject",
            "20 min, no erasing the first pass",
        ]),
        ("New Sound", "Make a beat in a genre you don't", [
            "Pick a genre you don't make",
            "Copy its groove, then twist it",
        ]),
        ("Cover It", "Rebuild a track's main loop by ear", [
            "Choose a track you love",
            "Rebuild its main loop by ear",
        ]),
        ("Odd Angle", "Shoot 10 photos, none at eye level", [
            "Shoot low, high, or through something",
            "10 frames, no eye-level shots",
        ]),
        ("New Medium", "20 min making one small thing in a new tool", [
            "Pick a tool or app you rarely open (Procreate, Blender, a synth…)",
            "Spend 20 min making one small, finished thing with it",
        ]),
        ("From Imagination", "Draw or compose with no reference", [
            "Draw or compose fully from your head",
            "Accept that it'll be rough",
        ]),
        ("Screen Study", "Watch one scene for how it's made", [
            "Watch a scene or episode",
            "Note one thing about its shots, story, or edit",
        ]),
        ("Poem from a Prompt", "Write a poem from a random prompt", [
            "Pick a random word, object, or line",
            "Write a poem you wouldn't normally write",
        ]),
        ("New Style", "Learn one move in a new dance style", [
            "Pick a style outside your comfort — hip-hop, house, contemporary…",
            "Learn one signature move from a tutorial",
        ]),
        ("Sing Outside Your Lane", "Learn one phrase in a vocal style you avoid", [
            "Pick a style you avoid — falsetto, belt, harmony, a new genre",
            "Learn one short phrase in it from a tutorial",
        ]),
    ],
    "s-nature": [  # SPI — grounded, introspective
        ("Nature Attunement", "10 min outside, noticing each sense", [
            "Walk or sit outside 10 min",
            "Notice 5 things with each sense",
        ]),
        ("Green Hour", "15 min outdoors, phone away", [
            "Phone away",
            "15 min just being outdoors",
        ]),
        ("Walk Meditation", "A slow walk, breath matched to steps", [
            "Walk slowly",
            "Match your breath to your steps",
        ]),
        ("One Full Breath", "3 min: inhale 4s, exhale 6s", [
            "Inhale 4s, exhale 6s",
            "Repeat for 3 min",
        ]),
        ("Thought Audit", "5 min brain-dump onto paper", [
            "Dump every thought onto paper",
            "Circle the one that matters most",
        ]),
        ("Single-Task", "Do one ordinary task slowly, no multitasking", [
            "Pick one ordinary task",
            "Do it slowly, no multitasking",
        ]),
    ],
    "s-ally": [  # CHA — ambivert mix
        ("New Ally", "A real conversation with someone new", [
            "Ask their name and one real question",
            "Listen more than you talk",
        ]),
        ("First Contact", "Break the ice with a stranger", [
            "A comment or question is enough",
            "Keep it light",
        ]),
        ("Ask a Question", "Ask someone you know something new", [
            "Ask something you've never asked them",
        ]),
        ("Reconnect", "Message someone you've drifted from", [
            "Send the message you've been putting off",
        ]),
        ("Listen Fully", "Mostly listen — let them talk", [
            "Let them talk",
            "Ask follow-ups — don't redirect to you",
        ]),
    ],
    "s-code": [  # INT
        ("Arcane Study: Code", "30 min on one lesson, typed by hand", [
            "Follow one freeCodeCamp lesson or docs page",
            "Type every example by hand — no copy-paste",
        ]),
        ("Debug Something", "Fix one bug, then test it", [
            "Find one bug or one messy function in your code",
            "Fix it, then write a test that proves it works",
        ]),
        ("Math Reps", "10 timed problems at your level", [
            "Do 10 problems at your current level",
            "Time the last 5 — beat your first-half pace",
        ]),
        ("Japanese Study", "20 min: grammar/kanji + flashcards", [
            "15 min: one grammar point or 5 kanji (write each 3×)",
            "5 min: flashcard review (Anki or WaniKani)",
        ]),
        ("Read the Docs", "30 min in the docs for a tool you use", [
            "Pick a tool/language you use (e.g. Python, React, git)",
            "Read one section you've always skipped",
            "Try one thing from it in a scratch file",
        ]),
        ("Explain It", "Learn a concept, then explain it simply", [
            "Learn one concept you're shaky on",
            "Write it in your own words in 5 sentences",
        ]),
        ("Down the Rabbit Hole", "Chase one nagging question to an answer", [
            "Pick one question that's been nagging you",
            "Read until it clicks, then note the answer in a line",
        ]),
    ],
    # ── Wealth (WLT) ──────────────────────────────────────────────────────────
    "d-wealth": [  # daily — money that matters: dodge debt, save with diskarte, build passive income
        ("Ledger Study", "Track today's money", [
            "Log today's money in and out in the tracker (You tab)",
            "Spot one leak — a fee, subscription, or interest — and plan to kill it",
        ]),
        ("Money Class", "10 min learning", [
            "Read or watch one lesson on getting out of debt, saving, or passive income",
            "Write the single idea you'll actually use in a sentence",
        ]),
        ("Skill to Sell", "Sharpen an earning skill", [
            "15 min improving a skill people pay for",
            "Note who'd pay for it — and how it could earn without your hours later",
        ]),
        ("Offer Draft", "Package something that can earn again", [
            "Describe one thing you could sell more than once — a beat, preset, template, or bit of code",
            "Put a price on it, and note where it could sell on autopilot",
        ]),
        ("Market Watch", "Learn how money makes money", [
            "Read one thing on a passive-income vehicle — dividends, index funds, high-yield savings, rent",
            "Note how it would pay you without trading your time",
        ]),
        ("Budget Tune", "Save with diskarte", [
            "Pick one saving move: pay yourself first, auto-transfer, envelope, or an ipon challenge",
            "Move a set amount to savings before you spend a peso",
        ]),
        ("Value Reps", "Learn the language of money", [
            "Learn one term that protects you — interest, APR, compounding, emergency fund, dividend",
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
        ("Extra Coin", "15 min on one real earning action", [
            "Pick one: sell, pitch, apply, or list something",
            "Spend 15 min and actually send or post it",
        ]),
        ("Learn & Earn", "One tutorial on a paid skill, then try it", [
            "Watch one tutorial on a skill people pay for",
            "Try it once on a tiny real example",
        ]),
        ("Declutter for Cash", "List one unused thing for sale", [
            "Find one thing you don't use",
            "List it for sale",
        ]),
        ("Price It Right", "Set a fair price for your work", [
            "Look up what your skill usually charges",
            "Adjust your price to match your worth",
        ]),
        ("Network Node", "Message one person in your field", [
            "Message one person who earns where you'd like to",
            "Ask one genuine question",
        ]),
        ("Idea Bank", "Note one income idea + its first step", [
            "Write down one way you could make money",
            "Note the first small step to test it",
        ]),
    ],
    # ── Craft (CFT) — deliberate practice toward Senior ─────────────────────────
    # Banded fundamentals-first: fluency (0) → patterns & problem-solving (1) →
    # system design & architecture (2). The daily floor (deep-work minutes) is
    # applied on top; interview mode swaps in INTERVIEW_POOLS.
    "d-craft": [  # daily — one deliberate rep, pitched to your band
        ("The Forge", "Deliberate coding practice", [
            "Pick one small problem and solve it from scratch",
            "Run it, then rewrite it to read cleaner",
            "Note the one thing you learned",
        ]),
        ("Read Good Code", "Study code better than yours", [
            "Open a well-regarded repo or a colleague's PR",
            "Read one file closely — trace how it flows",
            "Note one idea or pattern worth stealing",
        ]),
        ("Language Fluency", "Sharpen your main language", [
            "Pick one feature you use on autopilot (comprehensions, generics, async…)",
            "Write 3 tiny examples that use it well",
            "Learn one standard-library thing you didn't know",
        ]),
        ("Pattern Drill", "One data-structure / algorithm rep", [
            "Pick a pattern: two-pointers, hashmap, BFS/DFS, sliding window",
            "Solve one problem with it, from scratch",
            "Say out loud why it's the right tool here",
        ]),
        ("Refactor Rep", "Make working code better", [
            "Find one messy function in your own code",
            "Refactor it — clearer names, smaller pieces",
            "Add one test that proves it still works",
        ]),
        ("Test First", "Practise writing tests", [
            "Pick one function with no tests",
            "Write 3: the happy path, an edge case, a failure",
            "Watch them fail, then make them pass",
        ]),
        ("Systems Thinking", "Design something, on paper", [
            "Pick a system you use (URL shortener, chat, a feed)",
            "Sketch its components and how data flows",
            "Name one bottleneck and how you'd scale past it",
        ]),
        ("Architecture Read", "Study how real systems are built", [
            "Read one engineering blog post or design doc",
            "Note the core tradeoff they made, and why",
            "Ask: what would I have done differently?",
        ]),
        ("Tradeoff Study", "Reason about a real decision", [
            "Pick one: SQL vs NoSQL, sync vs queue, monolith vs services",
            "Write the case for each in three lines",
            "Decide — and name exactly what you're giving up",
        ]),
    ],
    "w-craft": [  # weekly — one bigger piece of real work
        ("Master Work", "Ship a small thing end to end", [
            "Pick a tiny scope (a CLI, a script, a page)",
            "Build it so it actually runs",
            "Commit it with a short README",
        ]),
        ("Fix It for Real", "Close one real issue properly", [
            "Pick a bug or paper-cut in your project",
            "Fix the root cause, not the symptom",
            "Add a test so it can't come back",
        ]),
        ("Feature End-to-End", "Own one feature start to finish", [
            "Design it briefly, then build it",
            "Write the tests that cover it",
            "Open a clean PR with a clear description",
        ]),
        ("Study a Codebase", "Learn from a real project", [
            "Clone a well-regarded open-source repo",
            "Trace one feature from entry point to output",
            "Write half a page on how it's structured",
        ]),
        ("Design a System", "A full system-design rep", [
            "Pick a prompt (design Twitter, Uber, a rate limiter)",
            "Work requirements → API → data model → scaling",
            "Write it up as if explaining it to someone",
        ]),
        ("Deep Dive", "Master one hard topic", [
            "Pick one: consistency, caching, indexing, concurrency",
            "Read 2–3 solid sources on it",
            "Explain it out loud, with a diagram",
        ]),
    ],
    "s-craft": [  # side — a quick, optional craft rep
        ("Sharpen the Axe", "15 min drilling one skill, typed by hand", [
            "15 min improving one skill you use daily",
            "Type every example by hand — no copy-paste",
        ]),
        ("Docs Deep-Dive", "Read a docs section you skip, then try it", [
            "Read one docs section you always skip",
            "Try one thing from it in a scratch file",
        ]),
        ("Code Review", "Review one PR, leave one real comment", [
            "Review one open PR (yours or open-source)",
            "Leave one substantive, specific comment",
        ]),
        ("One Kata", "Solve one small problem in 20 min", [
            "Solve one small problem in 20 minutes",
            "Then read a cleaner solution and compare",
        ]),
        ("Whiteboard It", "Sketch a project's architecture from memory", [
            "Sketch the architecture of something you built",
            "Name one thing you'd redesign now",
        ]),
    ],
}

# Interview mode (Player.interview_mode): when on, Craft's slots swap to these
# interview-prep variants — timed DSA, mock system design, behavioural stories.
# Same banding as POOLS; a beginner prepping still gets band-0 work. Every slot
# keeps a band-0 variant so pool_variant always finds something when it steps down.
INTERVIEW_POOLS: dict[str, list[tuple[str, str, list[str]]]] = {
    "d-craft": [
        ("Daily DSA", "One interview problem, done right", [
            "Pick one problem at your level (Blind 75 / NeetCode)",
            "Solve it in 25 min — narrate your approach out loud",
            "Read the optimal solution; name the underlying pattern",
        ]),
        ("Explain Your Solution", "Practise thinking out loud", [
            "Solve one easy problem",
            "Record yourself explaining it as if to an interviewer",
            "Note where you rambled or went quiet",
        ]),
        ("Pattern of the Day", "Drill one interview pattern", [
            "Pick a pattern: two-pointers, sliding window, BFS/DFS, DP",
            "Solve two short problems using it",
            "Write the tell that signals this pattern",
        ]),
    ],
    "w-craft": [
        ("Behavioural Prep", "Get your stories ready", [
            "Pick 3 stories (a conflict, a failure, a win)",
            "Write each as Situation · Task · Action · Result",
            "Say one out loud in under two minutes",
        ]),
        ("Mock Interview", "Simulate the real thing", [
            "Do a timed mock (Pramp, a friend, or solo)",
            "One medium problem — talk the entire time",
            "Write down two things to fix next round",
        ]),
        ("Mock System Design", "One full system-design mock", [
            "Pick a prompt and set a 45-minute timer",
            "Requirements → high-level → deep-dive → tradeoffs",
            "Review it against a rubric afterwards",
        ]),
    ],
    "s-craft": [
        ("Flashcard Fundamentals", "Drill the trivia they ask", [
            "Review fundamentals: big-O, HTTP, SQL joins, OOP",
            "Quiz yourself on five, out loud",
        ]),
        ("Timed Set", "A quick timed DSA set", [
            "Three easy/medium problems, 15 min each",
            "No peeking until the timer's up",
        ]),
        ("Review a Design", "Study one system design", [
            "Read one system-design write-up",
            "Note the pattern and the single key tradeoff",
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
    "CFT": "Focused Craft",
}

# Concrete steps for a focused side quest — attribute-flavoured, with the chosen
# focus dropped in ({f}), so it reads as real tasks rather than a bare "Your focus:".
FOCUS_STEPS: dict[str, list[str]] = {
    "STR": ["Warm up, then 15 focused minutes on {f}", "Push one set or drill past comfortable"],
    "CRE": ["Spend 15–20 minutes creating on {f}", "Make one choice you don't usually make"],
    "SPI": ["Take 10 quiet minutes on {f}", "Notice what shifts — breath, body, mood"],
    "CHA": ["Do one real thing for {f} today", "Reach out or show up — don't just plan it"],
    "INT": ["Spend 15 focused minutes on {f}", "Keep the one idea worth remembering"],
    "WLT": ["Take one concrete action on {f}", "Make it real — send, log, or set it up"],
    "CFT": ["Spend 20 focused minutes on {f}", "Ship one small improvement"],
}


def focus_steps(stat: str, focus: str) -> list[str]:
    """Real, checkable tasks for a focused side quest, with `focus` interpolated."""
    tmpl = FOCUS_STEPS.get(stat, ["Spend 15 focused minutes on {f}", "Do one concrete thing toward it"])
    return [s.replace("{f}", focus) for s in tmpl]

# Daily non-negotiables, LEVELED. Each daily below has a floor that's prepended
# to that day's rotating steps and met every day no matter which variant shows —
# but it *climbs* with the attribute's progression level (see progression.py).
# FLOORS[slot][level] is the floor at that level; the last entry is the cap, held
# once you've built the habit. Fundamentals-first: each starts gentle (5 push-ups,
# 3 breaths, just log the money) so you can begin at zero. Only the areas below
# have a floor; Creativity and Connection stay floor-free (a single rotating
# action is the day's commitment) and progress by content band instead.
FLOORS: dict[str, list[list[str]]] = {
    "d-train": [  # STR — progressive overload + an explosive (plyometric) core rep
        ["5 push-ups (or knee push-ups — form first)", "20s plank",
         "10 overhead slams (ball, bag, or water jug) — explode down, brace hard"],
        ["8 push-ups (good form)", "30s plank",
         "12 overhead slams — full reach, sharp slam"],
        ["10 push-ups", "40s plank",
         "8 rotational slams per side — snap through the hips"],
        ["12 push-ups", "45s plank",
         "10 rotational slams per side — sharp, athletic rotation"],
        ["15 push-ups", "50s plank",
         "8 explosive sit-up throws + 8 rotational slams per side"],
        ["20 push-ups", "60s plank",
         "12 rotational slams per side + 10 overhead slams — max intent, reset between"],  # cap
    ],
    "d-meditate": [  # SPI — from a pause, toward a real sit
        ["Pause for 3 slow breaths before you begin"],
        ["Pause for 5 slow breaths before you begin"],
        ["Settle for 1 minute before you begin"],
        ["Settle for 2 minutes before you begin"],
        ["Settle for 3 minutes before you begin"],
        ["Settle for 5 minutes before you begin"],  # cap
    ],
    "d-wealth": [  # WLT — awareness deepening into management (logs in the You-tab tracker)
        ["Log today's money in the tracker (You tab) — everything in and out"],
        ["Log today's money in the tracker; watch what leaks to fees or interest"],
        ["Log today's money in the tracker; name one expense to trim, and pay yourself first"],
        ["Log today's money in the tracker; keep the gap positive — save before you spend"],
        ["Log today's money in the tracker; nudge toward this week's saving target"],
        ["Money check-in in the tracker (You): today's in/out, the week's gap, and no new debt"],  # cap
    ],
    "d-craft": [  # CFT — a deep-work minimum that grows as the habit sets in
        ["Show up to the code — 15 focused minutes, one small rep"],
        ["20 focused minutes — notifications off"],
        ["25 minutes of real practice — one clear goal"],
        ["30 minutes of deep work — phone in another room"],
        ["40 minutes of deep work — one problem, full attention"],
        ["45 minutes of deep work — sustained and distraction-free"],  # cap
    ],
}

# Reading (INT) floor climbs by *pace*: how fast you finish a book. Higher level
# → fewer days to finish → more per day. It's book-dependent — a longer book asks
# more per day than a short one to keep pace. Days-to-finish per reading level:
_READING_PACE_DAYS: list[int] = [14, 10, 8, 7, 6, 5]
# Fallback when the book's length is unknown: chapters/day per reading level.
_READING_CHAPTERS: list[int] = [1, 1, 1, 2, 2, 3]

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
    "Move Practice": "🎥 STEEZY (YouTube)",
    "Rhythm & Groove": "🎥 STEEZY (YouTube)",
    "Learn a Routine": "🎥 1MILLION Dance Studio (YouTube)",
    "New Style": "🎥 STEEZY (YouTube)",
    "Sing Practice": "🎥 New York Vocal Coaching (YouTube)",
    "Pitch & Control": "🌐 Singing Carrots — pitch & ear training",
    "Perform a Song": "🎥 New York Vocal Coaching (YouTube)",
    "Sing Outside Your Lane": "🎥 New York Vocal Coaching (YouTube)",
    "Memorise a Song": "🌐 Genius — lyrics & annotations (genius.com)",
    # SPI — meditation
    "Inner Gate": "📖 Mindfulness in Plain English — Bhante Gunaratana",
    "Body Scan": "🎧 Waking Up — Sam Harris",
    "Deep Stillness": "🎧 Waking Up — Sam Harris",
    "Box Breathing": "🎥 Huberman Lab (YouTube)",
    # CHA — people skills
    "Good Question": "📖 How to Win Friends and Influence People — Dale Carnegie",
    "Listen Fully": "📖 How to Win Friends and Influence People — Dale Carnegie",
    "Deep Talk": "🎥 Charisma on Command (YouTube)",
    # INT — learn how to learn (foundation), then code, math, Japanese, the world
    "Active Recall": "📖 Make It Stick — Brown, Roediger & McDaniel",
    "Mind Map": "🎥 Justin Sung (YouTube)",
    "Feynman It": "🎥 Ali Abdaal — the Feynman Technique (YouTube)",
    "Learn How to Learn": "🌐 Learning How to Learn — Barbara Oakley (Coursera)",
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
    # (The daily Japanese plan, d-jp, carries its own resource per phase — see
    # japanese_content — so it isn't listed here.)
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
    # CFT — craft: fluency & fundamentals (0) → patterns (1) → system design (2)
    "Read Good Code": "📖 The Pragmatic Programmer — Hunt & Thomas",
    "Language Fluency": "📖 The Pragmatic Programmer — Hunt & Thomas",
    "Refactor Rep": "📖 Refactoring — Martin Fowler",
    "Test First": "📖 Refactoring — Martin Fowler",
    "Pattern Drill": "🌐 NeetCode (neetcode.io)",
    "Systems Thinking": "📖 System Design Interview — Alex Xu",
    "Design a System": "📖 System Design Interview — Alex Xu",
    "Architecture Read": "🌐 ByteByteGo (bytebytego.com)",
    "Tradeoff Study": "📖 Designing Data-Intensive Applications — Martin Kleppmann",
    "Deep Dive": "📖 Designing Data-Intensive Applications — Martin Kleppmann",
    "Study a Codebase": "🌐 The Odin Project (theodinproject.com)",
    "Master Work": "🌐 The Odin Project (theodinproject.com)",
    "Code Review": "📖 The Pragmatic Programmer — Hunt & Thomas",
    "One Kata": "🌐 NeetCode (neetcode.io)",
    # CFT — interview mode
    "Daily DSA": "🌐 NeetCode (neetcode.io)",
    "Pattern of the Day": "🌐 NeetCode (neetcode.io)",
    "Timed Set": "🌐 LeetCode (leetcode.com)",
    "Mock Interview": "🌐 Pramp (pramp.com)",
    "Mock System Design": "📖 System Design Interview — Alex Xu",
    "Review a Design": "🌐 ByteByteGo (bytebytego.com)",
    "Behavioural Prep": "📖 Cracking the Coding Interview — Gayle McDowell",
    "Flashcard Fundamentals": "🌐 Tech Interview Handbook (techinterviewhandbook.org)",
}


# Content band per variant, where "harder" isn't a number: 0 foundation → 1
# building → 2 depth. Fundamentals before tactics — a level's band (see
# progression.band_for) picks which variants are in play, so the pool grows in
# ambition as the hunter climbs. Anything unlisted is band 0 (always available),
# so STR/SPI variety stays flat — their difficulty lives in the leveled FLOOR.
TIER: dict[str, int] = {
    # CRE — technique/quick reps → intentional → finish & stretch
    "Instrument Time": 1, "Beat Lab": 1, "Photo Walk": 1, "Frame Work": 2,
    "Photo Set": 1, "Learn a Song": 1, "Rhythm & Groove": 1,
    "Finish a Beat": 2, "Short Edit": 2, "Full Render": 2, "Finish a Poem": 2, "Learn a Routine": 2,
    "New Sound": 1, "Odd Angle": 1, "New Medium": 1,
    "Beyond the Comfort Zone": 2, "Cover It": 2, "From Imagination": 2, "Poem from a Prompt": 2, "New Style": 2,
    "Pitch & Control": 1, "Perform a Song": 2, "Sing Outside Your Lane": 2,  # singing (Sing Practice = band 0)
    # CHA — show up → quality → depth & reach
    "Check In": 1, "Voice, Not Text": 1, "Good Question": 1, "Make Plans": 2,
    "Guild Night": 1, "Party Gathering": 1, "Deep Talk": 2, "New Table": 2,
    "Reconnect": 1, "Listen Fully": 1, "New Ally": 2, "First Contact": 2,
    # INT — learn-how-to-learn (0) → apply to domains (1) → depth (2)
    "Growth Read": 1, "Code Kata": 1, "Math from Zero": 1, "Kana Drill": 1, "Current Affairs": 1,
    "Kanji & Grammar": 2, "Into History": 2, "Map the World": 2, "Science Dive": 2, "Problem Set": 2,
    "Math Milestone": 1, "Japanese Checkpoint": 1, "Ship Something": 2, "Understand the World": 2,
    "Arcane Study: Code": 1, "Math Reps": 1, "Japanese Study": 1,
    "Debug Something": 2, "Down the Rabbit Hole": 2,
    # WLT — money psychology/principles (0) → manage (1) → earn (2)
    "Ledger Study": 1, "Budget Tune": 1, "Skill to Sell": 2, "Offer Draft": 2, "Micro-Hustle": 2,
    "Money Review": 1, "Invest Plan": 1, "Ship an Offer": 2, "Chase a Lead": 2, "Build the Funnel": 2,
    "Price It Right": 1, "Extra Coin": 2, "Declutter for Cash": 2, "Network Node": 2,
    # CFT — fluency/fundamentals (0) → patterns & problem-solving (1) → system design (2)
    "Pattern Drill": 1, "Refactor Rep": 1, "Test First": 1,
    "Systems Thinking": 2, "Architecture Read": 2, "Tradeoff Study": 2,
    "Feature End-to-End": 1, "Study a Codebase": 1, "Design a System": 2, "Deep Dive": 2,
    "Code Review": 1, "One Kata": 1, "Whiteboard It": 2,
    # CFT — interview mode
    "Pattern of the Day": 1, "Mock Interview": 1, "Mock System Design": 2,
    "Timed Set": 1, "Review a Design": 2,
}


def period_key(cadence: str, day: str) -> str:
    """Weekly AND side quests rotate per ISO week (a side quest is a once-a-week
    optional bonus); only dailies rotate per day. Also the scope a quest's
    step-checks belong to."""
    return day if cadence == "daily" else game.week_key(day)


# Back-compat alias used within this module.
_period_key = period_key


def _pick(slot_id: str, period_key: str, n: int) -> int:
    """A stable index into a pool — same slot + period always maps the same way."""
    digest = hashlib.md5(f"{slot_id}:{period_key}".encode()).hexdigest()
    return int(digest, 16) % n


def reading_floor(book: str | None, level: int, chapters: int = 0) -> str:
    """The reading non-negotiable — a chapter a day, but at a pace that climbs.

    Higher reading level → fewer days to finish → more per day. When the book's
    chapter count is known the target is book-dependent (a longer book asks more
    to keep pace); otherwise it falls back to a chapters/day curve."""
    where = f" of {book}" if book else " of your current book"
    lvl = max(0, min(level, len(_READING_PACE_DAYS) - 1))
    if chapters and chapters > 0:
        per = max(1, round(chapters / _READING_PACE_DAYS[lvl]))
    else:
        per = _READING_CHAPTERS[lvl]
    return f"Read {per} chapters{where}" if per > 1 else f"Read a chapter{where}"


def days_to_finish(level: int) -> int:
    """How many days a book should take at this reading level — the denominator
    the Status screen uses to show reading progress. Higher level → fewer days."""
    return _READING_PACE_DAYS[max(0, min(level, len(_READING_PACE_DAYS) - 1))]


# A self-set priority that sits on top of the plan (e.g. "abs this week"). Common
# asks get a handcrafted frame; anything else gets a clean generic one. Matched by
# keyword substring on the lowercased focus — no LLM, always free.
PRIORITY_TEMPLATES: list[tuple[tuple[str, ...], str, str, list[str]]] = [
    (("abs", "core", "six pack", "midsection"),
     "Abs & core",
     "Explosive core, a little every day — on top of your usual training.",
     ["Add a hard core-slam finisher to today's session",
      "Brace through every rep — quality over count",
      "Keep protein up, junk down"]),
    (("save", "saving", "ipon", "budget"),
     "Saving diskarte",
     "Keep more of what you earn — pay yourself first.",
     ["Move a set amount to savings before you spend",
      "Kill one leak (a fee, sub, or impulse buy)",
      "Log the day's money in the tracker (You tab)"]),
    (("passive", "invest", "dividend", "index"),
     "Passive income",
     "Build money that works while you sleep.",
     ["Learn one passive vehicle — index fund, dividend, HYSA, rent",
      "Do one concrete step toward setting it up",
      "Note the next action to grow it"]),
    (("debt", "utang", "loan", "interest"),
     "Kill the debt",
     "Starve the interest, protect your future income.",
     ["List what you owe and its interest rate",
      "Throw an extra bit at the highest-rate one",
      "Take on no new debt today"]),
    (("read", "book"),
     "Read more",
     "Chip away at the book, every day.",
     ["Read past today's reading floor",
      "Note the one idea worth keeping"]),
    (("badminton", "smash", "footwork", "court"),
     "Badminton sharpening",
     "Small technical reps on top of training.",
     ["Drill one weak shot for 10 focused minutes",
      "Add fast footwork or shadow swings",
      "Note one thing to fix next session"]),
    (("sleep", "rest", "recovery"),
     "Sleep & recovery",
     "Guard your recovery — it powers everything else.",
     ["Set a wind-down time tonight and hold it",
      "Screens off 30 min before bed",
      "Note how rested you felt"]),
]


def priority_content(focus: str) -> tuple[str, str, list[str]]:
    """Handcrafted (title, note, steps) for a pinned priority, matched by keyword.
    Anything unmatched gets a clean generic frame — no LLM, always free."""
    f = (focus or "").strip().lower()
    for keys, title, note, steps in PRIORITY_TEMPLATES:
        if any(k in f for k in keys):
            return title, note, list(steps)
    label = (focus or "").strip()[:60]
    return (
        label or "Your priority",
        "Your focus right now — a little toward it each day.",
        ["Do one concrete thing toward this today", "Note what you did"],
    )


def floor_for(quest: QuestDef, book: str | None = None, level: int = 0, chapters: int = 0) -> list[str]:
    """The mandatory non-negotiable steps for a slot at the given progression
    `level` — the floor met every day regardless of the day's variant or whether
    an LLM wrote it. Leveled floors (STR/SPI/WLT) climb through FLOORS; Grow opens
    with the reading floor (pace scales with level + book length). Empty for slots
    with no floor (Creativity, Connection, and all non-daily slots)."""
    tiers = FLOORS.get(quest.id)
    if tiers is not None:
        return list(tiers[max(0, min(level, len(tiers) - 1))])
    if quest.id == "d-read":
        return [reading_floor(book, level, chapters)]
    return []


def pool_variant(quest: QuestDef, day: str, band: int = 0, interview: bool = False) -> tuple[str, str, list[str]]:
    """The raw (title, desc, steps) picked from the handcrafted pool for the
    period — no floor applied. `band` (0 foundation → 2 depth) narrows the pool to
    variants that fit where the hunter is, stepping down if a band is unstocked.
    When `interview` is on and the slot has an interview pool (Craft), that pool is
    used instead. Used as the fallback and as a style seed for the LLM prompt."""
    pool = (INTERVIEW_POOLS.get(quest.id) if interview else None) or POOLS.get(quest.id)
    if not pool:
        return quest.title, quest.desc, []  # unknown slot → seeded fallback
    target = max(0, min(band, 2))
    chosen = pool
    for b in range(target, -1, -1):
        eligible = [v for v in pool if TIER.get(v[0], 0) == b]
        if eligible:
            chosen = eligible
            break
    pk = _period_key(quest.cadence, day)
    tag = f"{pk}|b{target}" + ("|iv" if interview else "")
    return chosen[_pick(quest.id, tag, len(chosen))]


# ── Japanese: a phased learning plan (kana → grammar → kanji) ─────────────────
# The daily Japanese quest follows a beginner's roadmap rather than rotating
# randomly. Which phase you're in is set by how many weeks you've been studying
# (see state._jp_week); within a phase, the task still varies day to day. Each
# entry is (title, desc, steps, resource).
# Hiragana comes first — it writes native words and every grammatical particle
# (は, を, が…), so you can't read a real sentence without it. Katakana (loanwords)
# follows once hiragana is comfortable. This is the standard Genki/Tofugu order.
_JP_HIRAGANA: list[tuple[str, str, list[str], str]] = [
    ("Hiragana Row", "10 min — the script for native words", [
        "Learn one hiragana row (e.g. か き く け こ)",
        "Trace each, then write it 5× from memory",
        "Read 5 words that use today's row, out loud",
    ], "🌐 Tofugu — hiragana guide (with mnemonics)"),
    ("Hiragana Tracing", "10 min muscle memory", [
        "Use a hiragana tracing worksheet for the rows you're on",
        "Trace slowly, saying each sound as you write it",
    ], "🌐 Tofugu — printable hiragana worksheets"),
    ("Hiragana Reading", "10 min putting it together", [
        "Read a short list of hiragana-only words aloud",
        "Just decode the sounds smoothly — no katakana or kanji yet",
    ], "🌐 Tofugu — hiragana reading practice"),
]
_JP_KATAKANA: list[tuple[str, str, list[str], str]] = [
    ("Katakana Row", "10 min — the script for foreign words", [
        "Learn one katakana row (e.g. カ キ ク ケ コ)",
        "Write each 5×, then read 5 loanwords (コーヒー, テレビ…)",
    ], "🌐 Tofugu — katakana guide"),
    ("Kana Flashcards", "10 min recall", [
        "Run a hiragana + katakana flashcard deck (Anki or an app)",
        "Keep the ones you miss and drill just those again",
    ], "🎧 Anki — kana deck (spaced repetition)"),
    ("Kana Reading", "10 min putting it together", [
        "Read a short mix of hiragana + katakana words aloud",
        "No kanji yet — just decode the sounds smoothly",
    ], "🌐 Tofugu — kana reading practice"),
]
_JP_GRAMMAR: list[tuple[str, str, list[str], str]] = [
    ("Sentence Shape", "15 min — Subject–Object–Verb", [
        "Learn the SOV order — Japanese puts the verb last",
        "Turn 3 English sentences into JP order (私は寿司を食べる)",
    ], "🌐 Tae Kim's Guide — sentence structure"),
    ("Particle は (wa)", "15 min — the topic marker", [
        "Study は — it marks the topic ('as for…')",
        "Write 3 sentences using は and say them aloud",
    ], "🌐 Tae Kim's Guide — the は particle"),
    ("Particle を (wo)", "15 min — the object marker", [
        "Study を — it marks the direct object of a verb",
        "Write 3 sentences (パンを食べる) and say them aloud",
    ], "🌐 Tae Kim's Guide — the を particle"),
    ("Mini Sentences", "15 min — put the particles to work", [
        "Build 5 simple SOV sentences using は and を",
        "Check them against a grammar guide or a native example",
    ], "🎥 Tokini Andy — Genki grammar (YouTube)"),
]
_JP_KANJI: list[tuple[str, str, list[str], str]] = [
    ("Kanji Set", "15 min — common characters", [
        "Learn 5 common kanji — meaning, reading, stroke order",
        "Write each 3×, then use one in a short sentence",
    ], "🎧 WaniKani — kanji & vocab SRS"),
    ("Everyday Vocab", "10 min — words you'll actually use", [
        "Clear today's SRS reviews (Anki / WaniKani)",
        "Add 5 everyday words (food, travel, directions)",
    ], "🎧 Anki / WaniKani — spaced repetition"),
    ("Kanji in Context", "15 min — read the real thing", [
        "Read 2–3 short sentences mixing kanji + grammar",
        "Note any new kanji and one grammar point you spot",
    ], "🌐 NHK Easy News (nhk.or.jp/news/easy)"),
    ("Listening", "10 min — train your ears", [
        "Listen to a short clip (Nihongo con Teppei, or a show scene)",
        "Note 3 words or phrases you caught",
    ], "🎧 Nihongo con Teppei (podcast)"),
    ("Travel Phrases", "10 min — survival Japanese", [
        "Pick a situation: train, restaurant, shop, directions",
        "Learn 5 phrases for it and practise saying them",
    ], "🌐 Tofugu — essential travel Japanese"),
    ("Shadowing", "10 min — speaking", [
        "Pick one or two lines of native audio",
        "Shadow them 5× each — match the rhythm and pitch",
    ], "🎥 Comprehensible Japanese (YouTube)"),
]


def japanese_content(week_num: int, day: str) -> tuple[str, str, list[str], str]:
    """Today's Japanese task for a learner `week_num` weeks in, following the plan:
    Week 1 hiragana → Week 2 katakana → Week 3 basic grammar → Week 4+ kanji &
    everyday context. The phase is fixed by the week; the exact task rotates within
    it, day to day. Hiragana precedes katakana on purpose (see the pools above)."""
    if week_num <= 1:
        pool = _JP_HIRAGANA
    elif week_num == 2:
        pool = _JP_KATAKANA
    elif week_num == 3:
        pool = _JP_GRAMMAR
    else:
        pool = _JP_KANJI
    return pool[_pick("d-jp", f"jp:{day}", len(pool))]


def content_for(
    quest: QuestDef,
    day: str,
    focus: list[str] | None = None,
    book: str | None = None,
    level: int = 0,
    chapters: int = 0,
    interview: bool = False,
    jp_week: int = 0,
) -> tuple[str, str, list[str], str]:
    """The (title, desc, steps, resource) a slot should show from the handcrafted
    pool for the period containing `day`, with the mandatory floor prepended.

    `focus` is the attribute's set of focuses; a side quest rotates through them
    day to day. `book`/`chapters` drive the reading floor. `level` is the stat's
    progression level — it climbs the floor and picks the content band.
    `interview` (Craft only) swaps in the interview-prep pool. `jp_week` (Japanese
    only) drives the phased learning plan. `resource` points at a trusted place to
    learn (empty when there isn't one)."""
    if quest.id == "d-jp":
        return japanese_content(jp_week or 1, day)  # follows the kana→grammar→kanji plan
    if quest.cadence == "side" and focus:
        pk = _period_key(quest.cadence, day)
        chosen = focus[_pick(quest.id, pk + "|focus", len(focus))]
        title = FOCUS_TITLES.get(quest.stat, "Personal Focus")
        return title, f"Your focus: {chosen}", focus_steps(quest.stat, chosen), ""
    title, desc, steps = pool_variant(quest, day, progression.band_for(level), interview)
    steps = floor_for(quest, book, level, chapters) + steps  # non-negotiables first, then variety
    return title, desc, steps, RESOURCES.get(title, "")
