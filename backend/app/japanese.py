"""The Japanese learning plan: one ordered walk from the hiragana chart to kanji.

The plan used to be a calendar — week 1 hiragana, week 2 katakana, week 3 grammar,
week 4+ kanji — which is the same mistake as a chapters-per-day quota. Three weeks in
you were being handed kanji whether or not you could read か, and the plan had no way
of knowing. So it is a position now, not a date: `Player.japanese_step` is how far
along the walk you are, and it moves when you actually finish a step.

The walk itself is the standard beginner order, and each stage is a prerequisite for
the one after it:

  1. hiragana   — every native word and every particle is written in it
  2. katakana   — the same sounds, sharper shapes; loanwords, names, menus
  3. words      — high-frequency vocabulary and the particles that glue it together
  4. sentences  — subject–object–verb, and the endings that make it a sentence
  5. kanji      — slowly, starting with numbers, days, directions, simple nouns

Inside a stage the daily quest alternates between the step's own new material and
practising what you already hold, because a plan that introduced new characters every
single day would be a chart you had read rather than a chart you knew. Only a day that
introduces something moves the position (see `introduces`).

The kana rows pair each plain row with its dakuten and handakuten. They are the same
shapes with a mark on them, and learning さ a fortnight before ざ means meeting ざ as
something new rather than as さ voiced.
"""

from __future__ import annotations

from datetime import date

# ── The stages, and the steps inside them ────────────────────────────────────

HIRAGANA = "hiragana"
KATAKANA = "katakana"
WORDS = "words"
SENTENCES = "sentences"
KANJI = "kanji"

STAGES: dict[str, str] = {
    HIRAGANA: "Hiragana",
    KATAKANA: "Katakana",
    WORDS: "Words & particles",
    SENTENCES: "Sentence shape",
    KANJI: "Kanji",
}

# A kana row: the label the plan calls it, and the lines of characters it covers.
# One line per mark — the plain row, then its dakuten, then its handakuten — so the
# quest can print them as the chart prints them.
_HIRAGANA_ROWS: list[tuple[str, str, list[str]]] = [
    ("Vowels", "the five every other row is built on", ["あ い う え お — a i u e o"]),
    ("K row", "and its dakuten", ["か き く け こ — ka ki ku ke ko", "が ぎ ぐ げ ご — ga gi gu ge go"]),
    ("S row", "and its dakuten", ["さ し す せ そ — sa shi su se so", "ざ じ ず ぜ ぞ — za ji zu ze zo"]),
    ("T row", "and its dakuten", ["た ち つ て と — ta chi tsu te to", "だ ぢ づ で ど — da ji zu de do"]),
    ("N row", "no mark on this one", ["な に ぬ ね の — na ni nu ne no"]),
    ("H row", "its dakuten and its handakuten", [
        "は ひ ふ へ ほ — ha hi fu he ho",
        "ば び ぶ べ ぼ — ba bi bu be bo",
        "ぱ ぴ ぷ ぺ ぽ — pa pi pu pe po",
    ]),
    ("M row", "no mark on this one", ["ま み む め も — ma mi mu me mo"]),
    ("Y row", "only three of them", ["や ゆ よ — ya yu yo"]),
    ("R row", "closer to an L than an R", ["ら り る れ ろ — ra ri ru re ro"]),
    ("W row and ん", "the last of the chart", ["わ を — wa wo", "ん — n, the one that stands alone"]),
    ("Combinations", "a small ゃゅょ fuses two into one", [
        "きゃ きゅ きょ · しゃ しゅ しょ · ちゃ ちゅ ちょ · にゃ にゅ にょ",
        "ひゃ ひゅ ひょ · みゃ みゅ みょ · りゃ りゅ りょ",
        "ぎゃ ぎゅ ぎょ · じゃ じゅ じょ · びゃ びゅ びょ · ぴゃ ぴゅ ぴょ",
    ]),
]

_KATAKANA_ROWS: list[tuple[str, str, list[str]]] = [
    ("Vowels", "same sounds you already know", ["ア イ ウ エ オ — a i u e o"]),
    ("K row", "and its dakuten", ["カ キ ク ケ コ — ka ki ku ke ko", "ガ ギ グ ゲ ゴ — ga gi gu ge go"]),
    ("S row", "and its dakuten", ["サ シ ス セ ソ — sa shi su se so", "ザ ジ ズ ゼ ゾ — za ji zu ze zo"]),
    ("T row", "and its dakuten", ["タ チ ツ テ ト — ta chi tsu te to", "ダ ヂ ヅ デ ド — da ji zu de do"]),
    ("N row", "no mark on this one", ["ナ ニ ヌ ネ ノ — na ni nu ne no"]),
    ("H row", "its dakuten and its handakuten", [
        "ハ ヒ フ ヘ ホ — ha hi fu he ho",
        "バ ビ ブ ベ ボ — ba bi bu be bo",
        "パ ピ プ ペ ポ — pa pi pu pe po",
    ]),
    ("M row", "no mark on this one", ["マ ミ ム メ モ — ma mi mu me mo"]),
    ("Y row", "only three of them", ["ヤ ユ ヨ — ya yu yo"]),
    ("R row", "closer to an L than an R", ["ラ リ ル レ ロ — ra ri ru re ro"]),
    ("W row and ン", "the last of the chart", ["ワ ヲ — wa wo", "ン — n, the one that stands alone"]),
    ("The long mark ー", "and the combinations", [
        "ー holds the vowel: コーヒー (kōhī, coffee), ケーキ (kēki, cake)",
        "キャ シャ チャ ニャ ヒャ ミャ リャ ギャ ジャ ビャ ピャ — as in hiragana",
    ]),
]

# What a step asks of you, once the characters are in front of you. Same three lines
# for every row, because the work is the same work — and the third line is the deck
# on Learn, so the drilling has somewhere to happen rather than being an instruction
# to go and find an app.
def _kana_steps(lines: list[str], stack: str) -> list[str]:
    return [
        *lines,
        "Write each one 5× while saying its sound out loud",
        f"Then work the {stack} stack on Learn until today's are coming back clean",
    ]


def _kana_plan(rows: list[tuple[str, str, list[str]]], stage: str, script: str, stack: str, resource: str) -> list[dict]:
    return [
        {
            "stage": stage,
            "title": f"{script}: {label}",
            "desc": f"10 min — {note}",
            "steps": _kana_steps(lines, stack),
            "resource": resource,
        }
        for label, note, lines in rows
    ]


_TOFUGU_HIRAGANA = "🌐 Tofugu — hiragana guide (with mnemonics)"
_TOFUGU_KATAKANA = "🌐 Tofugu — katakana guide (with mnemonics)"
_TAE_KIM = "🌐 Tae Kim's Guide to Japanese (guidetojapanese.org)"
_GENKI = "📖 Genki: An Integrated Course in Elementary Japanese"
_NHK_EASY = "🌐 NHK Easy News (nhk.or.jp/news/easy)"

# Words and the particles that hold them together. Deliberately before any grammar
# block: five words and は will get you further than a chapter on verb conjugation,
# and the particles are what turn a pile of nouns into something you can say.
_WORD_STEPS: list[dict] = [
    {
        "stage": WORDS,
        "title": "This, that, and that over there",
        "desc": "10 min — the words you point with",
        "steps": [
            "これ (kore) this · それ (sore) that · あれ (are) that over there",
            "ここ (koko) here · そこ (soko) there · あそこ (asoko) over there",
            "Point at five things around you and name each one out loud",
        ],
        "resource": _TAE_KIM,
    },
    {
        "stage": WORDS,
        "title": "The three you'll use every day",
        "desc": "10 min — politeness first",
        "steps": [
            "ありがとう (arigatō) thank you · すみません (sumimasen) excuse me, sorry",
            "おねがいします (onegaishimasu) please · はい / いいえ (hai / iie) yes / no",
            "Say each one out loud until it arrives without thinking",
        ],
        "resource": "🌐 Tofugu — essential travel Japanese",
    },
    {
        "stage": WORDS,
        "title": "Particle は",
        "desc": "15 min — the topic marker",
        "steps": [
            "は marks what the sentence is about — 'as for…'. Written は, said wa",
            "わたしは がくせいです — as for me, student",
            "Write three sentences with は and read them aloud",
        ],
        "resource": _TAE_KIM,
    },
    {
        "stage": WORDS,
        "title": "Particle を",
        "desc": "15 min — the object marker",
        "steps": [
            "を marks the thing a verb is done to. Written を, said o",
            "みずを のみます — drink water · パンを たべます — eat bread",
            "Write three sentences with を and read them aloud",
        ],
        "resource": _TAE_KIM,
    },
    {
        "stage": WORDS,
        "title": "Particles に and の",
        "desc": "15 min — where to, and whose",
        "steps": [
            "に points somewhere or somewhen — がっこうに いきます (go to school)",
            "の links two nouns, the owner first — わたしの ほん (my book)",
            "Write two sentences with に and two with の",
        ],
        "resource": _TAE_KIM,
    },
    {
        "stage": WORDS,
        "title": "One to ten, and counting",
        "desc": "10 min — numbers you can say",
        "steps": [
            "いち に さん し ご ろく なな はち きゅう じゅう — 1 to 10",
            "Count something in the room out loud, then say your own phone number",
        ],
        "resource": _GENKI,
    },
    {
        "stage": WORDS,
        "title": "Today, tomorrow, now",
        "desc": "10 min — words that place a sentence in time",
        "steps": [
            "きょう today · あした tomorrow · きのう yesterday · いま now",
            "あさ morning · ひる midday · よる night",
            "Say what you did きのう and what you'll do あした — one line each",
        ],
        "resource": _GENKI,
    },
]

# The shape of a sentence. This is where the English brain has to be turned around,
# so the whole stage is one idea practised five ways rather than five new ideas.
_SENTENCE_STEPS: list[dict] = [
    {
        "stage": SENTENCES,
        "title": "The verb goes last",
        "desc": "15 min — subject, object, verb",
        "steps": [
            "English is subject–verb–object. Japanese is subject–object–verb",
            "'I eat an apple' becomes 'I apple eat' — わたしは りんごを たべます",
            "Turn five English sentences into Japanese order, on paper",
        ],
        "resource": _TAE_KIM,
    },
    {
        "stage": SENTENCES,
        "title": "です sentences",
        "desc": "15 min — X is Y",
        "steps": [
            "これは ほんです — this is a book. です closes the sentence",
            "Build five です sentences about things you can see",
        ],
        "resource": _GENKI,
    },
    {
        "stage": SENTENCES,
        "title": "Asking with か",
        "desc": "15 min — a question needs no new word order",
        "steps": [
            "か on the end turns a statement into a question — これは ほんですか",
            "Write three questions and their answers, both out loud",
        ],
        "resource": _GENKI,
    },
    {
        "stage": SENTENCES,
        "title": "Saying no",
        "desc": "15 min — the negative ending",
        "steps": [
            "たべます → たべません · のみます → のみません",
            "ほんです → ほんじゃありません",
            "Take three sentences you already wrote and negate each one",
        ],
        "resource": _GENKI,
    },
    {
        "stage": SENTENCES,
        "title": "Put it together",
        "desc": "15 min — your own sentences, out loud",
        "steps": [
            "Write five sentences about your own day using は, を and a verb",
            "Read them aloud, then check them against a grammar guide or a native example",
        ],
        "resource": "🎥 Tokini Andy — Genki grammar (YouTube)",
    },
]

# Kanji, slowly and in sets that share a theme — 2,000 characters is not a plan, and
# the first hundred you actually meet in the wild are numbers, days and simple nouns.
_KANJI_STEPS: list[dict] = [
    {
        "stage": KANJI,
        "title": "Numbers",
        "desc": "15 min — the first ten you'll see everywhere",
        "steps": [
            "一 二 三 四 五 六 七 八 九 十 — one to ten",
            "Write each 3×, and read a few prices or dates that use them",
        ],
        "resource": "🎧 WaniKani — kanji & vocab SRS",
    },
    {
        "stage": KANJI,
        "title": "Days of the week",
        "desc": "15 min — 日 月 火 水 木 金 土",
        "steps": [
            "日 sun · 月 moon · 火 fire · 水 water · 木 tree · 金 gold · 土 earth",
            "Each one plus 曜日 names a day — 月曜日 is Monday",
            "Write today's date in kanji",
        ],
        "resource": "🎧 WaniKani — kanji & vocab SRS",
    },
    {
        "stage": KANJI,
        "title": "Where things are",
        "desc": "15 min — 上 下 中 外 前 後",
        "steps": [
            "上 above · 下 below · 中 inside · 外 outside · 前 before · 後 after",
            "Write each 3×, then use two of them in a sentence about your room",
        ],
        "resource": "🎧 WaniKani — kanji & vocab SRS",
    },
    {
        "stage": KANJI,
        "title": "Nature",
        "desc": "15 min — 木 山 川 田 石 空",
        "steps": [
            "木 tree · 山 mountain · 川 river · 田 rice field · 石 stone · 空 sky",
            "Write each 3×. Notice 山 and 川 look like what they mean",
        ],
        "resource": "🎧 WaniKani — kanji & vocab SRS",
    },
    {
        "stage": KANJI,
        "title": "People",
        "desc": "15 min — 人 女 男 子 父 母",
        "steps": [
            "人 person · 女 woman · 男 man · 子 child · 父 father · 母 mother",
            "Write each 3×, then write one sentence about your family",
        ],
        "resource": "🎧 WaniKani — kanji & vocab SRS",
    },
    {
        "stage": KANJI,
        "title": "Read something real",
        "desc": "15 min — kanji in the wild",
        "steps": [
            "Read one NHK Easy News story, out loud, all the way through",
            "Note every kanji you already knew, and pick three new ones to keep",
        ],
        "resource": _NHK_EASY,
    },
]

PLAN: list[dict] = [
    *_kana_plan(_HIRAGANA_ROWS, HIRAGANA, "Hiragana", "Hiragana", _TOFUGU_HIRAGANA),
    *_kana_plan(_KATAKANA_ROWS, KATAKANA, "Katakana", "Hiragana", _TOFUGU_KATAKANA),
    *_WORD_STEPS,
    *_SENTENCE_STEPS,
    *_KANJI_STEPS,
]

LAST_STEP = len(PLAN) - 1


# ── Practice: what the other days of a stage do ──────────────────────────────
#
# Every stage needs days that add nothing. Recall is what turns a row you have read
# into a row you know, and a plan that introduced five new characters every morning
# would be a chart you had been shown rather than one you could read.

_PRACTICE: dict[str, list[tuple[str, str, list[str], str]]] = {
    HIRAGANA: [
        ("Hiragana Recall", "10 min — the stack, not the chart", [
            "Work the Hiragana stack on Learn until the pile is done",
            "Anything you miss comes back in a few cards — say the sound before you turn it",
        ], ""),
        ("Hiragana Tracing", "10 min muscle memory", [
            "Trace a worksheet for the rows you have so far",
            "Say each sound as you write it — the hand and the mouth learn together",
        ], "🌐 Tofugu — printable hiragana worksheets"),
        ("Hiragana Reading", "10 min putting it together", [
            "Read a list of hiragana-only words out loud",
            "Decode the sounds smoothly — no katakana or kanji yet",
        ], "🌐 Tofugu — hiragana reading practice"),
    ],
    KATAKANA: [
        ("Kana Recall", "10 min — both scripts, mixed", [
            "Work the Hiragana stack on Learn, then run today's katakana rows from memory",
            "Write out any character you had to think about",
        ], ""),
        ("Loanword Reading", "10 min — the words katakana is for", [
            "Read ten loanwords out loud: コーヒー, テレビ, パン, タクシー, ホテル",
            "Say what each one is in English before you check",
        ], _TOFUGU_KATAKANA),
        ("Menu Reading", "10 min — katakana in the wild", [
            "Find a Japanese menu or product label and read the katakana on it",
            "Note two words you worked out without help",
        ], _TOFUGU_KATAKANA),
    ],
    WORDS: [
        ("Word Reps", "10 min — the words you have so far", [
            "Review every word and particle from this stage",
            "Use three of them in sentences about right now",
        ], _TAE_KIM),
        ("Say It Out Loud", "10 min — from your own head", [
            "Describe what you can see, in whatever Japanese you have",
            "Note the one word you wanted and didn't have — then look it up",
        ], ""),
        ("Listen In", "10 min — train your ears", [
            "Listen to one short clip and catch the particles you know",
            "Note three words you recognised",
        ], "🎧 Nihongo con Teppei (podcast)"),
    ],
    SENTENCES: [
        ("Flip Five", "10 min — English into Japanese order", [
            "Take five English sentences and put the verb last",
            "Read each Japanese one aloud before you check it",
        ], _TAE_KIM),
        ("Sentence Reps", "10 min — your own, not a textbook's", [
            "Write five sentences about your day using は, を and a verb",
            "Say each one out loud, then fix what sounded wrong",
        ], _GENKI),
        ("Shadowing", "10 min — speaking", [
            "Pick one or two lines of native audio",
            "Shadow them 5× each — match the rhythm, not just the words",
        ], "🎥 Comprehensible Japanese (YouTube)"),
    ],
    KANJI: [
        ("Kanji Reps", "10 min — clear the reviews", [
            "Clear today's SRS reviews (Anki or WaniKani)",
            "Write out any character you failed, three times each",
        ], "🎧 WaniKani — kanji & vocab SRS"),
        ("Kanji in Context", "15 min — read the real thing", [
            "Read two or three sentences mixing kanji and the grammar you have",
            "Note one new kanji and one grammar point you spotted",
        ], _NHK_EASY),
        ("Everyday Vocab", "10 min — words you'll actually use", [
            "Add five everyday words — food, travel, directions",
            "Use two of them in a sentence out loud",
        ], "🎧 Anki / WaniKani — spaced repetition"),
    ],
}

# How often a day introduces new material rather than practising. One in three: two
# days of recall behind every row is roughly what it takes for a row to stop being
# something you look up, and it puts the whole chart inside a month either way.
_INTRODUCE_EVERY = 3


def step_at(position: int) -> dict:
    """The step held at `position`, clamped. Past the end the plan holds on its last
    step rather than running out — there is no day on which Japanese is finished."""
    return PLAN[max(0, min(position, LAST_STEP))]


def stage_at(position: int) -> str:
    """Which stage a position falls in — derived, never stored, so the two can't
    disagree about where you are."""
    return step_at(position)["stage"]


def _ordinal(day: str) -> int:
    return date.fromisoformat(day).toordinal()


def introduces(day: str) -> bool:
    """Whether today's Japanese quest hands over new material, or drills what you
    already have.

    Counted off the calendar rather than hashed from it. The rest of the app picks pool
    variants by hashing a period key, which is right when all you want is "don't show
    the same one twice running" — but here the ratio is the promise. A hash gave runs
    of five drilling days and then two new rows back to back, which is a cadence you
    can't plan a week around.

    Deterministic either way, so the card and the completion hook agree about what
    today was.
    """
    return _ordinal(day) % _INTRODUCE_EVERY == 0


def progress(position: int) -> dict:
    """Where the plan stands, for the app and the morning email: the stage being
    worked, the step inside it, and how far along the whole walk you are."""
    at = max(0, min(position, LAST_STEP))
    stage = PLAN[at]["stage"]
    in_stage = [n for n, s in enumerate(PLAN) if s["stage"] == stage]
    return {
        "stage": stage,
        "stage_label": STAGES[stage],
        "step": PLAN[at]["title"],
        "done": in_stage.index(at),
        "steps": len(in_stage),
        "position": at,
        "positions": len(PLAN),
    }


def content(position: int, day: str) -> tuple[str, str, list[str], str]:
    """Today's Japanese task: the step you're holding on the days that introduce it,
    and one of its stage's practice sittings on the days between.

    A practice day carries where you are in its description. Without it two days out
    of three read as a drill with no plan behind them — the step's own title is the
    only thing that ever says which stage this is, and it only shows every third day.
    """
    step = step_at(position)
    if introduces(day):
        return step["title"], step["desc"], list(step["steps"]), step["resource"]
    pool = _PRACTICE[step["stage"]]
    # Counted in practice days, not calendar days: a plain `ordinal % len(pool)` would
    # only ever land on the residues that aren't introducing days, so a third of every
    # pool would never be shown at all.
    at = _ordinal(day)
    title, desc, steps, resource = pool[(at - at // _INTRODUCE_EVERY) % len(pool)]
    at = progress(position)
    return title, f"{desc} · {at['stage_label']} {at['done'] + 1}/{at['steps']}", list(steps), resource


def next_position(position: int, day: str) -> int:
    """Where the plan stands after finishing today's Japanese quest.

    Only a day that introduced something moves it: ticking off a recall sitting is not
    a claim that you have learned a new row, and a plan that advanced on every
    completion would run the hunter through the whole chart in a fortnight of days
    they mostly spent drilling.
    """
    if not introduces(day):
        return position
    return min(position + 1, LAST_STEP)
