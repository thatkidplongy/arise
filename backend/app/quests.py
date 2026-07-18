"""Rotating quest content — free, offline, deterministic.

The 15 quests are stable *slots*: their id, stat, xp, cadence and target never
change (so completions, streaks and achievements keep counting). What rotates is
each slot's title + description + steps, picked from a hand-written pool by a
hash of the period — the day for daily/side quests, the ISO week for weekly ones.
Same board all day, a fresh one tomorrow. No storage, no external service, no cost.

Each variant is (title, desc, steps): the desc is the one-line "what", and steps
are the specific "how" — concrete instructions (reps × sets, timed segments,
prompts) so a quest tells you exactly what to do, not just its theme.

The pools are tuned to the hunter's real interests:
  STR  badminton + strength, plyometrics, home workouts
  CRE  drawing, music (FL Studio / instruments), photo & video
  SPI  calm, focus, self-reflection, breath & body — a grounded, reflective tone
  CHA  ambivert: deepen 1-on-1s and occasionally reach past the comfort zone
  INT  coding, math from scratch, Japanese (serious study), reading, and the
       wider world (politics, history, geography, science)

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
        ("Grimoire Study", "Read 20 min", [
            "Read for 20 minutes",
            "Write one sentence on what stuck",
        ]),
        ("Growth Read", "Self-help or a book that grows you", [
            "Read 20 minutes",
            "Pick one idea to actually try today",
        ]),
        ("Code Kata", "20 min coding", [
            "Pick one small problem or feature",
            "Write it, run it, tidy it up",
        ]),
        ("Math from Zero", "20 min fundamentals", [
            "Watch or read one concept",
            "Do 5 practice problems on it",
        ]),
        ("Kanji & Grammar", "15 min Japanese", [
            "Learn 5 new kanji or one grammar point",
            "Write 2 example sentences",
        ]),
        ("Kana Drill", "10 min kana", [
            "Drill one hiragana/katakana row",
            "Write each character 5×",
        ]),
        ("Current Affairs", "15 min news", [
            "Read one local and one world story",
            "Ask: who's affected, and why?",
        ]),
        ("Into History", "20 min history", [
            "Pick an era, event, or figure",
            "Note the cause and the consequence",
        ]),
        ("Map the World", "15 min geography", [
            "Pick a country or region",
            "Learn its location, capital, and one fact",
        ]),
        ("Science Dive", "20 min science", [
            "Pick one 'how does X work?' question",
            "Read until you can explain it simply",
        ]),
        ("Deep Page", "20 min reading", [
            "Phone in another room",
            "Read without stopping",
        ]),
        ("Problem Set", "Practice problems", [
            "5 problems (math or code)",
            "Redo any you got wrong",
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
    ],
    "w-tome": [  # INT — a weekly learning milestone
        ("Clear the Tome", "3 chapters", [
            "Read 3+ chapters this week",
            "Jot the gist of each",
        ]),
        ("Ship Something", "Small coding project", [
            "Define one tiny scope",
            "Build it end to end",
            "Ship or commit it",
        ]),
        ("Math Milestone", "Full topic", [
            "Finish one topic's lessons",
            "Complete its problem set",
        ]),
        ("Japanese Checkpoint", "A textbook lesson", [
            "Finish one lesson",
            "Drill its kanji and vocab",
            "Review with flashcards",
        ]),
        ("Understand the World", "Go deep on one topic", [
            "Pick: history, science, politics, or geography",
            "Read 3+ sources",
            "Explain it to someone in your words",
        ]),
        ("Deep Study", "Course section or long read", [
            "Finish one section",
            "Summarise it in your own words",
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
            "Follow one tutorial or docs page",
            "Type the examples — don't copy-paste",
        ]),
        ("Debug Something", "Fix or refactor", [
            "Find one bug or messy function",
            "Fix it and test it",
        ]),
        ("Math Reps", "20 min practice", [
            "10 problems at your current level",
            "Speed up the easy ones",
        ]),
        ("Japanese Study", "20 min structured", [
            "Grammar or kanji, 15 min",
            "Flashcard review, 5 min",
        ]),
        ("Read the Docs", "30 min deep on a tool", [
            "Pick a tool or language you use",
            "Read one section you skipped before",
        ]),
        ("Explain It", "Learn it, then write it", [
            "Learn one concept",
            "Write it in your own words (5 sentences)",
        ]),
        ("Down the Rabbit Hole", "Follow your curiosity", [
            "Pick a question that nags you",
            "Read until it clicks",
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


def content_for(
    quest: QuestDef, day: str, focus: list[str] | None = None
) -> tuple[str, str, list[str]]:
    """The (title, desc, steps) a slot should show for the period containing `day`.

    `focus` is the attribute's set of focuses; a side quest rotates through them
    day to day, so every focus gets its turn."""
    if quest.cadence == "side" and focus:
        pk = _period_key(quest.cadence, day)
        chosen = focus[_pick(quest.id, pk + "|focus", len(focus))]
        title = FOCUS_TITLES.get(quest.stat, "Personal Focus")
        return title, f"Your focus: {chosen}", []
    pool = POOLS.get(quest.id)
    if not pool:
        return quest.title, quest.desc, []  # unknown slot → seeded fallback
    return pool[_pick(quest.id, _period_key(quest.cadence, day), len(pool))]
