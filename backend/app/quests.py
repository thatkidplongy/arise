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
push-ups + plank + an explosive core rep on the physical daily). The floor is
*leveled* — it climbs as the hunter shows up consistently (see progression.py),
so there's no stagnation. Most floors start gentle so you can begin at zero; the
physical floor is the exception on purpose — it starts at working volume (sets ×
reps), because a floor too light to adapt to trains the habit but not the body. Where a quest is about learning, it points at a trusted
source (see RESOURCES), matched to the variant.

Progression also shapes the *variety* where "harder" isn't a number: each level
maps to a content band (0 foundation → 1 building → 2 depth, see TIER), and the
pool picks from the band that fits where the hunter is. Fundamentals come before
the complicated stuff — learn-how-to-learn before domains, principles before
tactics.

The pools are tuned to the hunter's real interests:
  STR  badminton + strength, plyometrics, home workouts; push-ups/plank/core floor,
       plus a daily *fuel* slot (d-fuel) — the diet plan, because a physique is
       written in the kitchen: its floor carries the hunter's own protein/calorie
       targets from the body profile (see fuel_floor)
  CRE  drawing, dance, singing, music (FL Studio / instruments), photo & video
  SPI  calm, focus, self-reflection, breath & body — a grounded, reflective tone
  CHA  ambivert: deepen 1-on-1s and occasionally reach past the comfort zone
  INT  learn-how-to-learn first, then math from scratch, Japanese, and the wider
       world (politics, history, geography, science); reading is the daily floor
       (at your own pace — the floor asks you to log what you read, not to hit a
       chapter quota)
  WLT  making money: money psychology & fundamentals first, then managing, then
       earning — side income, monetising skills
  CFT  the engineering craft, toward Senior: fluency & fundamentals → patterns &
       problem-solving → system design & architecture; a small deep-work floor
       daily, and an interview-mode toggle (INTERVIEW_POOLS) for DSA/mock prep

Personalisation: if the player sets a focus for an attribute (Settings →
Attribute focus), that attribute's *side quest* becomes their focus for the day.
"""

import hashlib

from datetime import date

from . import game, japanese, progression
from .models import QuestDef

# slot id -> pool of (title, desc, steps) variants. The seeded content is the
# first entry, so an unrotated read looks like the original quest.
POOLS: dict[str, list[tuple[str, str, list[str]]]] = {
    # ── Daily ────────────────────────────────────────────────────────────────
    "d-train": [  # STR — conditioning, plyo + home strength, at volumes that force adaptation
        ("Hunter Conditioning", "Full-body circuit, real volume", [
            "5 rounds: 15 jump squats, 12 push-ups, 40s plank",
            "Rest 45s between rounds — no longer",
            "Finish with 3 min jumping jacks or jump rope",
        ]),
        ("Plyo Burst", "Explosive lower-body plyometrics", [
            "5 × 12 jump squats — full depth, max height",
            "4 × 10 box or step jumps",
            "4 × 30s pogo hops · rest 60s between",
        ]),
        ("Home Circuit", "No-equipment home workout", [
            "5 rounds: 20 squats, 12 push-ups, 16 lunges (8/side), 45s plank",
            "Rest 60s between rounds",
        ]),
        ("Legs & Lunges", "Lower-body strength", [
            "5 × 20 bodyweight squats — slow down, drive up",
            "4 × 12 reverse lunges per leg",
            "4 × 20 calf raises + 3 × 15 glute bridges",
        ]),
        # The complement to the MWF 5K (see ROADWORK): running is quad- and
        # calf-dominant, both legs in one plane, so what it leaves behind is
        # hamstrings, glutes and single-leg control — which is also where runners
        # get hurt. Unilateral and slow on purpose; the road already covers volume.
        ("Hips & Hamstrings", "The bits running doesn't build", [
            "4 × 8 single-leg RDLs per leg — slow down, hips square, feel the hamstring take it",
            "4 × 10 Bulgarian split squats per leg — back foot on a chair, knee tracks over the toes",
            "3 × 15 single-leg glute bridges + 3 × 20 side-lying leg raises per side",
        ]),
        ("Explosive Footwork", "Plyo footwork for the court", [
            "8 × 15s split-step into lunge",
            "6 × 30s fast feet (ladder or line)",
            "4 × 10 jump lunges",
        ]),
        ("Push & Core", "Upper body and core", [
            "5 × 12–15 push-ups (feet elevated or diamond once easy)",
            "3 × 60s plank",
            "3 × 20 slow bicycle crunches + 15 V-ups",
        ]),
        ("Jump Rope", "Rope conditioning intervals", [
            "12 rounds: 45s skipping, 15s rest",
            "Mix in high knees or double-unders if you can",
        ]),
    ],
    "d-fuel": [  # STR — the diet plan. The floor (fuel_floor) carries the hunter's own
        # targets; these variants rotate one habit on top. Only the first step survives
        # the cap, so each variant leads with the one that matters.
        ("Fuel Discipline", "Eat to your targets", [
            "Build each plate: a palm of protein, a fist of veg, a cupped hand of carbs",
        ]),
        ("Protein First", "Order of eating matters", [
            "Eat the protein on your plate first — it protects muscle and blunts cravings",
        ]),
        ("Hunter's Rations", "Prep beats willpower", [
            "Cook or portion tomorrow's protein in advance — decided food doesn't get debated",
        ]),
        ("Water Discipline", "Thirst reads as hunger", [
            "A glass of water before every meal, and 2L across the day",
        ]),
        ("Clean Sweep", "Cut the liquid calories", [
            "No soft drinks, milk tea or juice today — water, black coffee, or plain tea",
        ]),
        ("Slow Eater", "Give fullness time to land", [
            "Eat one meal with no screen, putting the spoon down between bites",
        ]),
        ("Stock the Arsenal", "Make the good choice the easy one", [
            "Restock lean protein and veg — the Food screen suggests picks you can actually buy",
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
        ("Japanese Deep Rep", "15 min on whatever the plan has you on", [
            "Take the material the daily Japanese quest is on and push it one level harder",
            "Produce it from memory — write it, say it — before you check anything",
        ]),
        ("Kana Drill", "10 min kana", [
            "Work the kana stack on Learn until the pile is done",
            "Write out every character you missed, five times each",
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
        ("Japanese Checkpoint", "Prove the stage you're on", [
            "Read something out loud using only what you have so far — no looking ahead",
            "Write down every character or word you had to stop at",
            "Drill just those, then read the same thing again",
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
        ("Plyo Set", "6×6 max-effort jump squats, full rest", [
            "6 × 6 max-effort jump squats — every rep as high as the first",
            "Full rest between sets — don't rush",
        ]),
        ("Home Strength", "4 rounds: squats, push-ups, plank", [
            "4 × 15 squats, 4 × 12 push-ups, 3 × 45s plank",
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
        ("Japanese Study", "20 min: the plan, then recall", [
            "15 min on the step the daily Japanese quest is holding — write it out by hand",
            "5 min clearing the kana stack on Learn, or your SRS reviews once you're past kana",
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
    # ── Craft (CFT) — system thinking, design, architecture ────────────────────
    # The *daily* slot isn't here: it follows the 12-week system-design plan out of
    # the hunter's Notion notes (see _CRAFT_P1…P5 and `craft_content`), the same way
    # Japanese follows its phased plan. Interview mode swaps in INTERVIEW_POOLS.
    # Only the weekly slot rotates from a pool.
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
#
# Rebuilt from the hunter's own interview notes rather than generic prep. Their core
# insight is that you're scored on whether you've *owned* things, and the tell is
# specificity — so the reps are: say the three real stories cold with their real
# numbers, drill the five-beat incident structure (mitigation and prevention are the
# beats that separate senior from junior), rehearse the six question archetypes, and
# close the gaps they've already written down honestly.
INTERVIEW_POOLS: dict[str, list[tuple[str, str, list[str]]]] = {
    "d-craft": [
        ("Story A · Phone Normalisation", "The flagship, told in 90 seconds", [
            "Tell it cold: 57 buyers, nine days, zero revenue lost, ten files touched",
            "Land the detail that wins the room — the test whose name contradicted its assertion",
        ]),
        ("Story B · Duplicate Contacts", "The irreversible-operation story", [
            "Tell it cold: 35,182 scanned, 1,085 groups, 302 safe, 777 held back",
            "Land the line — a duplicate is recoverable, a wrong merge is not",
        ]),
        ("Story C · The Missing API", "Proving a negative properly", [
            "Tell it cold: five independent ways you verified the API didn't exist",
            "Land the point — 'impossible' needs more evidence than 'possible'",
        ]),
        ("The Five Beats", "Structure for anything that broke", [
            "Say the beats in order: blast radius, detection, mitigation, root cause, prevention",
            "Beats 3 and 5 in one sentence each — if you can't, you don't know the story yet",
        ]),
        ("Follow-ups Cold", "The drills under each story", [
            "Pick one story and answer three of its follow-ups without notes",
            "Write down the one that came out weakest",
        ]),
        ("Investigate Under Load", "Worked yesterday, failing today", [
            "Say the method in order: what changed, where's the time going, what's saturated",
            "Name the usual suspects and one mitigation before the fix",
        ]),
        ("Constraints First", "How would you approach this?", [
            "Restate a problem, name who suffers, then ask scale/consistency/failure before designing",
            "Say out loud what you'd deliberately exclude, and why",
        ]),
        ("Design With Trade-offs", "Scored on the trade-offs, not the boxes", [
            "Requirements → constraints → data model → components → failure modes",
            "Volunteer what breaks first at 10× — a design with no failure modes reads as untested",
        ]),
        ("The Docker Answer", "What your code runs inside", [
            "Tell the config-drift story: 41 repos, generated queue config, a validate command",
            "Be ready for image vs container, layers, secrets locally, and why not native",
        ]),
        ("Tell Me About Your Project", "Four levels of why", [
            "Problem as who suffers · the shape in three sentences · why that datastore",
            "The hardest decision and what it traded away, then what you'd do differently",
        ]),
        ("Close a Known Gap", "The three you wrote down honestly", [
            "Pick one: no load story, container internals, or design at internet scale",
            "Do the smallest real thing that shrinks it — one p99 number closes the first",
        ]),
    ],
    "w-craft": [
        ("Behavioural Prep", "Get your stories ready", [
            "Run the drill tracker: each story spoken under 90 seconds, from memory",
            "Tick only what you can do cold, and note which numbers slipped",
        ]),
        ("Mock Interview", "Simulate the real thing", [
            "Timed mock, talking the entire time — a systems round, not a kata",
            "Write down two things to fix next round",
        ]),
        ("Mock System Design", "One full system-design mock", [
            "Pick a prompt and set a 45-minute timer",
            "Requirements → high-level → deep-dive → trade-offs → what breaks first",
        ]),
    ],
    "s-craft": [
        ("Spoken Answers", "Read your own answers back", [
            "Re-read the spoken-answers page and say two of them out loud",
            "Note any that sound recited rather than owned",
        ]),
        ("Numbers Drill", "The part that can't be faked", [
            "Recite each story's real numbers from memory, then check them",
            "Any you missed, say the whole story again with them in",
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
# once you've built the habit. Most start gentle (3 breaths, just log the money)
# so you can begin at zero — but the physical floor starts at working volume (sets
# × reps): a single set of five push-ups builds the habit, not the body, and the
# hunter is here for the body. Scale a set down mid-set if form breaks; never the
# plan. Only the areas below have a floor; Creativity and Connection stay
# floor-free (a single rotating action is the day's commitment) and progress by
# content band instead.
FLOORS: dict[str, list[list[str]]] = {
    "d-train": [  # STR — real training volume + an explosive, home-only core rep (no equipment)
        ["3 × 10 push-ups — chest to floor, rest 60s (drop to knees only when form breaks)",
         "3 × 30s plank — braced flat, no sagging hips",
         "3 × 10 tuck jumps — knees to chest, land soft and quiet"],
        ["3 × 12 push-ups, rest 60s", "3 × 40s plank",
         "3 × 12 tuck jumps + 20s fast mountain climbers"],
        ["4 × 12 push-ups, rest 60s", "3 × 50s plank",
         "3 × 12 tuck jumps + 12 explosive V-ups"],
        ["4 × 15 push-ups — last set to failure", "3 × 60s plank",
         "4 × 12 tuck jumps + 15 explosive V-ups"],
        ["5 × 15 push-ups — last set to failure", "3 × 75s plank + 30s side plank each side",
         "4 × 15 tuck jumps + 20 explosive V-ups"],
        ["5 × 20 push-ups — last set to failure", "3 × 90s plank + 45s side plank each side",
         "5 × 15 tuck jumps + 25 explosive V-ups — max intent, reset between"],  # cap
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
}


# Where a quest is about *learning* something, point at a popular, well-trusted
# source. Keyed by the variant's title, so the pointer matches the day's focus.
# The emoji signals the medium: 📖 book · 🎥 YouTube · 🎧 audio/app · 🌐 site.
RESOURCES: dict[str, str] = {
    # STR — technique worth studying, and how to eat for the body you're training
    "Fuel Discipline": "🌐 Precision Nutrition — hand-portion guide",
    "Protein First": "🎥 Jeff Nippard — nutrition science (YouTube)",
    "Hunter's Rations": "🎥 Joshua Weissman — meal prep (YouTube)",
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
    "Japanese Deep Rep": "🎥 Tokini Andy — Genki walkthroughs (YouTube)",
    "Kana Drill": "🌐 Tofugu — hiragana & katakana guides",
    "Japanese Study": "🌐 Tae Kim's Guide to Japanese (guidetojapanese.org)",
    # (The daily Japanese plan, d-jp, carries its own resource per step — see
    # japanese.py — so it isn't listed here.)
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
    # CFT carries its own pointers — the phase pools name the exact Notion page or
    # book chapter for the day, so there's nothing to look up by title here.
    # CFT — interview mode: their own notes are the source, not a course.
    "Story A · Phone Normalisation": "📓 Notion · Backend Interview Notes — Story A",
    "Story B · Duplicate Contacts": "📓 Notion · Backend Interview Notes — Story B",
    "Story C · The Missing API": "📓 Notion · Backend Interview Notes — Story C",
    "The Five Beats": "📓 Notion · Backend Interview Notes §1",
    "Follow-ups Cold": "📓 Notion · Backend Interview Notes — follow-up drills",
    "Investigate Under Load": "📓 Notion · Backend Interview Notes §3.2",
    "Constraints First": "📓 Notion · Backend Interview Notes §3.3",
    "Design With Trade-offs": "📓 Notion · Backend Interview Notes §3.4",
    "The Docker Answer": "📓 Notion · Backend Interview Notes §3.5",
    "Tell Me About Your Project": "📓 Notion · Backend Interview Notes §3.6",
    "Close a Known Gap": "📓 Notion · Backend Interview Notes §4 — known gaps",
    "Spoken Answers": "📓 Notion · System Design Spoken Answers",
    "Numbers Drill": "📓 Notion · Backend Interview Notes §5 — drill tracker",
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
    "Japanese Deep Rep": 2, "Into History": 2, "Map the World": 2, "Science Dive": 2, "Problem Set": 2,
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
    "Mock Interview": 1, "Mock System Design": 2, "Review a Design": 2,
    # CFT — interview mode, from the hunter's own notes. The stories come first
    # (band 0: they are the load-bearing part), then the archetypes, then the
    # gap-closing and full mocks.
    "Story A · Phone Normalisation": 0, "Story B · Duplicate Contacts": 0,
    "Story C · The Missing API": 0, "The Five Beats": 0, "Numbers Drill": 0,
    "Follow-ups Cold": 1, "Investigate Under Load": 1, "Constraints First": 1,
    "The Docker Answer": 1, "Tell Me About Your Project": 1, "Spoken Answers": 1,
    "Design With Trade-offs": 2, "Close a Known Gap": 2,
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


def reading_floor(book: str | None) -> str:
    """The reading non-negotiable — read at your own pace, then say what you read.

    Deliberately quota-free: a fixed "read 3 chapters today" is a target set by the
    app rather than by the book or the day, and it turns a good sitting into a
    failed one. The floor is showing up and recording the truth; the chapters you
    log are what moves the book toward finished (Status → Reading)."""
    what = book or "your current book"
    return f"Read {what} at your pace, then log which chapters"


def fuel_floor(targets: dict | None, level: int) -> list[str]:
    """The diet non-negotiable — the numbers are the hunter's own, computed from
    their body profile (nutrition.targets), so the quest reads as *my* diet plan
    rather than generic advice. Two steps at every level: log it, and hit today's
    marks. What climbs with level is how many marks a day carries — protein first,
    then the calorie band, then fibre — never how harshly they're judged: the band
    stays a range to land inside, not a line to fail at.

    Without a profile there are no real numbers, so the floor's first job is to
    send you to set one up."""
    if not targets:
        return [
            "Set your body profile (You → Food) so your targets are real numbers",
            "Log everything you eat today on the Food screen",
        ]
    protein, lo, hi, fibre = (targets["protein_g"], targets["target_low"],
                              targets["target_high"], targets["fibre_g"])
    log = "Log everything you eat today on the Food screen — every meal counted"
    plan = "Log each meal before you eat it — decide, then eat"
    tiers = [
        [log, f"Protein ≥ {protein} g — muscle is built from it"],
        [log, f"Protein ≥ {protein} g · nothing sugary to drink"],
        [log, f"Protein ≥ {protein} g · finish inside {lo}–{hi} kcal"],
        [log, f"Protein ≥ {protein} g · {lo}–{hi} kcal · fibre ≥ {fibre} g"],
        [plan, f"Protein ≥ {protein} g · {lo}–{hi} kcal · fibre ≥ {fibre} g"],
        [plan, f"Protein ≥ {protein} g · {lo}–{hi} kcal · fibre ≥ {fibre} g · nothing sugary to drink"],  # cap
    ]
    return tiers[max(0, min(level, len(tiers) - 1))]


# A self-set priority that sits on top of the plan (e.g. "abs this week"). Common
# asks get a handcrafted frame; anything else gets a clean generic one. Matched by
# keyword substring on the lowercased focus — no LLM, always free.
PRIORITY_TEMPLATES: list[tuple[tuple[str, ...], str, str, list[str]]] = [
    (("abs", "core", "six pack", "midsection"),
     "Abs & core",
     "Explosive core, a little every day — on top of your usual training.",
     ["Add an explosive core finisher — tuck jumps or V-ups",
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


# Slots whose cap isn't the usual 3. Physical is the one exception: its floor is
# three steps on its own (push-ups, plank, tuck jumps), so at a cap of 3 the floor
# ate the whole budget and every rotating variant was built and then trimmed away
# — the card read "Legs & Lunges" while listing push-ups, identically, every day.
# Five leaves room for the floor plus the two steps of the day's actual training.
STEP_CAPS: dict[str, int] = {"d-train": 5}
_STEP_CAP_WITH_FLOOR = 3
_STEP_CAP_BARE = 2


def cap_steps(steps: list[str], floor_len: int, slot_id: str = "") -> list[str]:
    """Keep a quest lean and glanceable: at most 2 steps, or 3 when it carries a
    mandatory floor (per-slot exceptions in STEP_CAPS). Floor steps come first, so
    they're the ones kept up to the cap; extra variety beyond that is trimmed —
    which is why every variant leads with the step that matters most."""
    if floor_len <= 0:
        return steps[:_STEP_CAP_BARE]
    return steps[: STEP_CAPS.get(slot_id, _STEP_CAP_WITH_FLOOR)]


def floor_for(quest: QuestDef, book: str | None = None, level: int = 0,
              craft_source: str | None = None, fuel: dict | None = None) -> list[str]:
    """The mandatory non-negotiable steps for a slot at the given progression
    `level` — the floor met every day regardless of the day's variant or whether
    an LLM wrote it. Leveled floors (STR/SPI/WLT) climb through FLOORS; Grow opens
    with the reading floor, which is level-independent by design; Fuel's floor is
    built from the hunter's own nutrition targets (`fuel`). Empty for slots with
    no floor (Creativity, Connection, and all non-daily slots)."""
    tiers = FLOORS.get(quest.id)
    if tiers is not None:
        return list(tiers[max(0, min(level, len(tiers) - 1))])
    if quest.id == "d-read":
        return [reading_floor(book)]
    if quest.id == "d-craft":
        return [craft_floor(craft_source, level)]
    if quest.id == "d-fuel":
        return fuel_floor(fuel, level)
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


# ── Craft (CFT): the 12-week system-design plan ───────────────────────────────
#
# Code generation is the cheap part now, so Craft studies the judgment that isn't:
# system thinking, design, and architecture. The material is the hunter's own Notion
# library — a 12-week plan with DDIA as the theory spine, Alex Xu vol 1–2 as practice
# reps, and 17 real case studies as anchors — so these quests point at notes that
# already exist rather than inventing exercises.
#
# The method is theirs, followed in order every phase:
#   1. read the DDIA chapters (theory) from the chapter notes
#   2. do the Xu chapter as a rep — design it on paper BEFORE reading his solution
#   3. re-read the anchor case studies and name which DDIA concept each applies
#   4. write the notes up: L5 quick notes per phase, L7 evergreen notes per concept
# So each phase carries one variant per step of that loop, themed to its chapters.
#
# 📓 marks the hunter's own Notion notes (the other emoji: 📖 book · 🎥 YouTube ·
# 🎧 audio/app · 🌐 site).

# What a Craft sitting *does* with whatever is currently open. Deliberately one
# source at a time: the material is `Player.craft_source`, and these vary the method
# rather than the reading. A quest that named a DDIA chapter, a case study and an Xu
# rep in the same three steps is a scavenger hunt, not a sitting — the reading loop
# names one book and lets you get on with it, and this is the same shape.
#
# So no step here may name a source. They all say "it": whatever you're holding.
_CRAFT_METHODS: list[tuple[str, str, list[str], str]] = [
    ("Read It Through", "Straight reading, then the takeaway", [
        "Write down the one idea from it you'd struggle to explain cold",
    ], ""),
    ("Closed Book", "Produce it before you check", [
        "Say the core mechanism out loud from memory, then read and find what you missed",
    ], ""),
    ("Draw The Mechanism", "A picture beats a paragraph", [
        "Sketch how it actually works on paper, then correct the sketch against the page",
    ], ""),
    ("Name The Trade-off", "The decision, and its price", [
        "Write down the trade-off it makes, and when the opposite choice would win",
    ], ""),
    ("What Breaks First", "Push it until it fails", [
        "Write down what breaks first at 10× and which part gives way",
    ], ""),
    ("Connect It", "Onto something you own", [
        "Write down where this applies in a system you actually run, and what you'd change",
    ], ""),
    ("Evergreen It", "One atomic idea, kept", [
        "Rephrase the idea in your own words — never copy-pasted — as one atomic Evergreen note (🌱, linked to its source)",
    ], "📓 Notion · Evergreen Notes (one idea per note)"),
]


# Systems thinking as its own discipline, not software architecture — from the
# framework the hunter captured in Inspire (structure generates behaviour, the
# fundamental attribution error, no isolated decisions, stocks and flows,
# reinforcing vs balancing loops). DDIA teaches how to build a system; this is
# reading the systems you're already inside, which is the half a book plan misses.
# Applied to something real every time: their platform, a team, a habit of theirs.
_CRAFT_SYSTEMS: list[tuple[str, str, list[str], str]] = [
    ("Causal Loop Map", "Draw the loops behind one outcome", [
        "Put one outcome you want to understand in the middle of a page, then ring it with what pushes it up or down",
        "Arrow the factors to each other (+ same direction, − opposite), trace the closed loops, and mark each reinforcing or balancing",
    ], "🎥 Systems thinking — your Ember capture (Tips)"),
    ("Stocks & Flows", "What accumulates, and what fills it", [
        "Pick one stock you care about (savings, energy, trust, tech debt) and name the flows in and out",
        "Write down which flow you'd change first, and why the stock lags behind it",
    ], "🎥 Systems thinking — your Ember capture (Tips)"),
    ("Loops in the Wild", "Reinforcing or balancing?", [
        "Find one runaway loop and one self-correcting loop in something you actually run",
        "Write down what would happen if the balancing loop broke",
    ], "🎥 Systems thinking — your Ember capture (Tips)"),
    ("Structure Over Blame", "Behaviour follows the system", [
        "Take one recurring frustration and assume everyone involved is doing their best",
        "Write down the structure that makes that behaviour the rational move, and the one change that would make it irrational",
    ], "🎥 Systems thinking — your Ember capture (Tips)"),
    ("Second-Order Effects", "There are no side effects", [
        "Take a decision you've already made and trace what it set in motion one and two steps out",
        "Write down the delayed effect you didn't anticipate at the time",
    ], "🎥 Systems thinking — your Ember capture (Tips)"),
]

# How often the slot leaves the reading for a systems rep. Counted in days rather
# than weekdays because Craft isn't a daily: the rotation in `state.active_daily_ids`
# shows it every 3rd day, so an "every Sunday" rule would land about monthly. A stride
# of 9 is a multiple of that 3, making this every 3rd Craft day — roughly weekly.
# `test_systems_reps_land_about_weekly_on_days_craft_is_actually_shown` checks it
# against the real rotation, so a rotation change fails loudly instead of drifting.
_SYSTEMS_STRIDE = 9


# The stretches of the plan, in order — guidance for what to pick as your next
# source, not a schedule and not the quest's content. You hold one until you say its
# material is read.
#
# `plan` names the pieces the stretch is made of, in the order you'd take them, so
# the card can hand you the next one rather than asking you to retype it. Its length
# is the denominator for the bar — a count of things to cover, never a deadline. Go
# off-plan whenever you like: the source is still yours to set by hand.
CRAFT_PHASES: list[dict] = [
    {
        "label": "Foundations",
        "detail": "DDIA ch 1–4 · Xu vol 1 ch 1–3",
        "plan": [
            "DDIA ch 1 — Reliable, Scalable and Maintainable Applications",
            "DDIA ch 2 — Data Models and Query Languages",
            "DDIA ch 3 — Storage and Retrieval",
            "DDIA ch 4 — Encoding and Evolution",
            "Xu vol 1 ch 1 — Scale from Zero to Millions of Users",
            "Xu vol 1 ch 2 — Back-of-the-Envelope Estimation",
            "Xu vol 1 ch 3 — A Framework for System Design Interviews",
        ],
    },
    {
        "label": "Distributing data",
        "detail": "DDIA ch 5–7 · consistent hashing, KV store",
        "plan": [
            "DDIA ch 5 — Replication",
            "DDIA ch 6 — Partitioning",
            "DDIA ch 7 — Transactions",
            "Xu vol 1 ch 5 — Design Consistent Hashing",
            "Xu vol 1 ch 6 — Design a Key-Value Store",
        ],
    },
    {
        "label": "Distributed truths",
        "detail": "DDIA ch 8–9 · unique ID, rate limiter",
        "plan": [
            "DDIA ch 8 — The Trouble with Distributed Systems",
            "DDIA ch 9 — Consistency and Consensus",
            "Xu vol 1 ch 4 — Design a Rate Limiter",
            "Xu vol 1 ch 7 — Design a Unique ID Generator",
        ],
    },
    {
        "label": "Derived data",
        "detail": "DDIA ch 10–12 · queue, metrics, aggregation",
        "plan": [
            "DDIA ch 10 — Batch Processing",
            "DDIA ch 11 — Stream Processing",
            "DDIA ch 12 — The Future of Data Systems",
            "Xu vol 2 — Distributed Message Queue",
            "Xu vol 2 — Metrics Monitoring and Alerting",
            "Xu vol 2 — Ad Click Event Aggregation",
        ],
    },
    {
        "label": "Design reps",
        "detail": "one design a sitting, closed book then diff",
        "plan": [
            "Xu vol 1 ch 8 — Design a URL Shortener",
            "Xu vol 1 ch 9 — Design a Web Crawler",
            "Xu vol 1 ch 10 — Design a Notification System",
            "Xu vol 1 ch 11 — Design a News Feed System",
            "Xu vol 1 ch 12 — Design a Chat System",
            "Xu vol 1 ch 13 — Design a Search Autocomplete System",
        ],
    },
]

LAST_CRAFT_PHASE = len(CRAFT_PHASES)


def craft_phase_info(phase: int) -> dict:
    """The phase you're currently in (1-based, clamped). The last phase — design reps
    — has no phase after it: that's the exit criteria, not a graduation, so it simply
    continues for as long as you want it to."""
    index = max(1, min(phase or 1, LAST_CRAFT_PHASE)) - 1
    return CRAFT_PHASES[index]


def craft_piece_at(phase: int, index: int) -> str:
    """The plan's piece at `index`, or "" once the phase's pieces are all covered.
    Running off the end isn't an error — it's the state that makes the check-in due."""
    plan = craft_phase_info(phase)["plan"]
    if index < 0 or index >= len(plan):
        return ""
    return plan[index]


def craft_floor(source: str | None, level: int) -> str:
    """The Craft non-negotiable: read the one thing you're holding, then record it.

    Same shape as the reading floor — it names a single source and sets no quota. What
    climbs with level is how much you produce from memory, not how much you must get
    through."""
    what = source.strip() if source and source.strip() else ""
    if not what:
        return "Pick what you're studying (Status → System design), then read it at your pace"
    tiers = [
        f"Read {what} at your pace, then log what you took away (Learn)",
        f"Read {what} at your pace; log it in your own words, never copy-pasted",
        f"Read {what}, then say its key idea back with the page closed",
        f"{what} — explain it from memory first, then read and log the gap",
        f"{what} — sketch the mechanism before you open it, then diff",
        f"{what} — explain or design it cold, then pull one atomic idea into an Evergreen note",
    ]
    return tiers[max(0, min(level, len(tiers) - 1))]


def is_systems_day(day: str) -> bool:
    """Whether today's Craft slot is a systems-thinking rep rather than reading."""
    return date.fromisoformat(day).toordinal() % _SYSTEMS_STRIDE == 0


def craft_content(day: str) -> tuple[str, str, list[str], str]:
    """What today's Craft sitting does with whatever source is currently open.

    Never *which* source — that's the hunter's, held in `Player.craft_source`, and the
    floor names it. Only the method rotates: read it through, do it closed-book, draw
    the mechanism, name the trade-off, and so on.

    Regularly the slot steps out of reading altogether for a systems-thinking rep —
    architecture is only half of what 'system thinking' means, and the other half
    needs a real system rather than a page."""
    if is_systems_day(day):
        return _CRAFT_SYSTEMS[_pick("d-craft", f"systems:{day}", len(_CRAFT_SYSTEMS))]
    return _CRAFT_METHODS[_pick("d-craft", f"craft:{day}", len(_CRAFT_METHODS))]


# ── Roadwork: the fixed running days ─────────────────────────────────────────
# Mon/Wed/Fri, with a rest day between each — the standard spacing for building
# distance, and the reason this is a weekday rule rather than a stride like
# `is_systems_day`. A weekday rule is only safe because Physical is in
# `_DAILY_ALWAYS` and shows every day: the run changes what the slot *contains*,
# never whether it appears, so it can't drift out of sync the way an "every
# Sunday" rule would against the 3-day rotation.
#
# The run replaces the day's rotating variant, not the floor — push-ups, plank and
# tuck jumps still lead the card, so the non-negotiable stays non-negotiable.
RUN_WEEKDAYS = (0, 2, 4)  # Mon, Wed, Fri
ROADWORK: tuple[str, str, list[str]] = (
    "Roadwork", "5 km on the road", [
        "5 km run — conversational pace, then empty the tank over the last 500 m",
        "Walk 5 min to come down, then stretch calves, quads and hip flexors while warm",
    ],
)


def is_roadwork(quest_id: str, day: str) -> bool:
    """Whether `quest_id` is Physical on one of its fixed running days — the day's
    training is the 5 km rather than a pool variant. Both the content builder and
    the generated-content guard in `state.resolve_content` ask this, so what counts
    as a run day is decided in one place."""
    return quest_id == "d-train" and date.fromisoformat(day).weekday() in RUN_WEEKDAYS


def content_for(
    quest: QuestDef,
    day: str,
    focus: list[str] | None = None,
    book: str | None = None,
    level: int = 0,
    interview: bool = False,
    jp_step: int = 0,
    craft_source: str | None = None,
    fuel: dict | None = None,
) -> tuple[str, str, list[str], str]:
    """The (title, desc, steps, resource) a slot should show from the handcrafted
    pool for the period containing `day`, with the mandatory floor prepended.

    `focus` is the attribute's set of focuses; a side quest rotates through them
    day to day. `book` names the current read in the reading floor. `level` is the
    stat's progression level — it climbs the floor and picks the content band.
    `interview` (Craft only) swaps in the interview-prep pool. `jp_step` is how far
    along the Japanese plan the hunter is; `craft_source` is the one thing Craft is
    studying; `fuel` is the hunter's nutrition targets for the diet floor. `resource`
    points at a trusted place to learn (empty when there isn't one)."""
    if quest.id == "d-jp":
        # Hiragana row by row, then katakana, words, sentence shape, kanji — held at
        # a position rather than paced by a calendar. See japanese.py.
        return japanese.content(jp_step, day)
    if quest.id == "d-craft" and not interview:
        # Follows the system-design plan at whatever phase the hunter is holding.
        # Interview mode opts out — it has its own pool, and a next-week interview
        # isn't served by wherever the plan happens to be.
        title, desc, steps, resource = craft_content(day)
        # On a systems day the rep *is* the sitting: bolting "read your source" onto a
        # whiteboard exercise would split one sitting across two places again.
        floor = [] if is_systems_day(day) else floor_for(quest, book, level, craft_source)
        return title, desc, cap_steps(floor + steps, len(floor)), resource
    if quest.cadence == "side" and focus:
        pk = _period_key(quest.cadence, day)
        chosen = focus[_pick(quest.id, pk + "|focus", len(focus))]
        title = FOCUS_TITLES.get(quest.stat, "Personal Focus")
        return title, f"Your focus: {chosen}", focus_steps(quest.stat, chosen), ""
    if is_roadwork(quest.id, day):
        title, desc, variant = ROADWORK  # the run is the day's training, floor unchanged
    else:
        title, desc, variant = pool_variant(quest, day, progression.band_for(level), interview)
    steps = floor_for(quest, book, level, craft_source, fuel) + variant  # non-negotiables first, then variety
    return title, desc, steps, RESOURCES.get(title, "")
