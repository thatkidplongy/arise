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

Every appearance of the quest works the step being held, and finishing it moves the
position on by one. The spacing is already there and did not need inventing: `d-jp` is
on the three-day daily rotation, so a step is a step every third morning, and the kana
stack on Learn is there to drill on the mornings between. A second cadence on top of
that one silently locked the two out of phase — the quest only ever came up on the days
the plan had decided were for drilling, so it never advanced at all.

Consolidation is a step rather than a mood: every few rows the plan stops adding and
asks you to read back everything you have. That way it sits in the same list as the
rows, advances the same way, and can't be skipped by a cadence.

The kana rows pair each plain row with its dakuten and handakuten. They are the same
shapes with a mark on them, and learning さ a fortnight before ざ means meeting ざ as
something new rather than as さ voiced.
"""

from __future__ import annotations

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

# What a step asks of you, once the characters are in front of you: the row, the hand,
# then somewhere to actually retrieve it from. `close` is that last part, and it differs by
# script — hiragana has a stack on Learn, and katakana has the loanwords it exists for.
# It used to send a katakana row to the Hiragana stack, which holds none of its
# characters: an instruction to drill today's row in a pile it isn't in.
def _kana_steps(lines: list[str], close: str) -> list[str]:
    return [*lines, "Write each one 5× while saying its sound out loud", close]


def _kana_plan(rows: list[tuple[str, str, list[str]]], stage: str, script: str, close: str, resource: str) -> list[dict]:
    return [
        {
            "stage": stage,
            "title": f"{script}: {label}",
            "desc": f"10 min — {note}",
            "steps": _kana_steps(lines, close),
            "resource": resource,
        }
        for label, note, lines in rows
    ]


_HIRAGANA_CLOSE = "Then work the Hiragana stack on Learn until today's are coming back clean"
_KATAKANA_CLOSE = "Then find five loanwords that use today's row and read them out loud"


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

def _hold(stage: str, title: str, desc: str, steps: list[str], resource: str) -> dict:
    """A step that adds nothing new and asks you to read back what you have.

    Every few rows, because a chart you have been shown one row at a time is not a
    chart you can read straight through — and reading it straight through is the only
    thing that proves the earlier rows are still there.
    """
    return {"stage": stage, "title": title, "desc": desc, "steps": steps, "resource": resource}


_HIRAGANA_HOLDS: dict[int, dict] = {
    5: _hold(HIRAGANA, "Hiragana: read it back", "10 min — nothing new today", [
        "Read a list of hiragana-only words out loud, using only the rows you have",
        "Write out any character you had to stop and think about, five times each",
        "Then clear the Hiragana stack on Learn",
    ], "🌐 Tofugu — hiragana reading practice"),
    11: _hold(HIRAGANA, "Hiragana: the whole plain chart", "15 min — the chart end to end", [
        "Write the chart out from memory, row by row, without looking",
        "Check it against the real one and mark every gap",
        "Trace a worksheet for whatever you got wrong",
    ], "🌐 Tofugu — printable hiragana worksheets"),
    13: _hold(HIRAGANA, "Hiragana: read something real", "15 min — you can read now", [
        "Find a few hiragana-only sentences and read them out loud, all the way through",
        "Don't translate — just decode the sounds smoothly",
    ], "🌐 Tofugu — hiragana reading practice"),
}

_KATAKANA_HOLDS: dict[int, dict] = {
    5: _hold(KATAKANA, "Katakana: read it back", "10 min — nothing new today", [
        "Read ten loanwords out loud: コーヒー, テレビ, パン, タクシー, ホテル",
        "Say what each one is in English before you check",
    ], _TOFUGU_KATAKANA),
    11: _hold(KATAKANA, "Katakana: both charts, mixed", "15 min — the two scripts together", [
        "Read a mix of hiragana and katakana words out loud",
        "Write out every character you hesitated on, five times each",
    ], _TOFUGU_KATAKANA),
    13: _hold(KATAKANA, "Katakana: in the wild", "15 min — a real menu or label", [
        "Find a Japanese menu or product label and read the katakana on it",
        "Note two words you worked out with no help at all",
    ], _TOFUGU_KATAKANA),
}


def _with_holds(steps: list[dict], holds: dict[int, dict]) -> list[dict]:
    """A stage's rows with its consolidation steps slotted in at their positions."""
    out: list[dict] = []
    for step in steps:
        if len(out) in holds:
            out.append(holds[len(out)])
        out.append(step)
    while len(out) in holds:
        out.append(holds[len(out)])
    return out


PLAN: list[dict] = [
    *_with_holds(_kana_plan(_HIRAGANA_ROWS, HIRAGANA, "Hiragana", _HIRAGANA_CLOSE, _TOFUGU_HIRAGANA), _HIRAGANA_HOLDS),
    *_with_holds(_kana_plan(_KATAKANA_ROWS, KATAKANA, "Katakana", _KATAKANA_CLOSE, _TOFUGU_KATAKANA), _KATAKANA_HOLDS),
    *_WORD_STEPS,
    *_SENTENCE_STEPS,
    *_KANJI_STEPS,
]

LAST_STEP = len(PLAN) - 1


def step_at(position: int) -> dict:
    """The step held at `position`, clamped. Past the end the plan holds on its last
    step rather than running out — there is no day on which Japanese is finished."""
    return PLAN[max(0, min(position, LAST_STEP))]


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


def content(position: int) -> tuple[str, str, list[str], str]:
    """The step being held, as the quest card shows it.

    No day in the signature: the quest is on the three-day rotation, so every morning
    it appears is a morning to work the step, and the plan advances when that step is
    finished. Consolidation is already in the plan (see `_with_holds`), so there is
    nothing left for a date to decide.
    """
    step = step_at(position)
    at = progress(position)
    return (
        step["title"],
        f"{step['desc']} · {at['stage_label']} {at['done'] + 1}/{at['steps']}",
        list(step["steps"]),
        step["resource"],
    )


def next_position(position: int) -> int:
    """Where the plan stands after finishing today's Japanese quest.

    Held at the last step rather than running out: the tail of the plan is reading real
    Japanese, and there is no morning on which that is finished.
    """
    return min(max(0, position) + 1, LAST_STEP)
