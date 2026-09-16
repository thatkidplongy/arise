"""How long each piece of written text may be.

One number per thing, named once. These were spelled twice — as `max_length` on
the Pydantic field that rejects an over-long request, and again as a `[:n]` slice
in the service function that stores it — which is two places to change and no way
to notice when only one of them moved. The pair is deliberate and both halves
stay: the schema refuses what the app should never have sent, and the slice is
the belt-and-braces for anything that reaches the service another way (a script,
a repair job). They just agree by construction now.

`src/consts.ts` mirrors the three the note editor shows you a count against, so
you can see the limit coming rather than finding the server quietly trimmed or
rejected what you wrote. Python can't be imported from TypeScript, so that copy is
kept by hand — change a number here and change it there.

The three written-note caps are deliberately ordered: a quest note is the long
one. It answers a written prompt and is the place real thinking gets done, so it
gets the most room by a wide margin; a learning note sits beside a source that
carries most of the meaning, and a journal entry is a day's worth, not an essay.
The numbers are a judgement about what each surface is *for*, not about what the
database can hold — `text` columns are unbounded in both SQLite and Postgres.
"""

# Reading & study
READING_LABEL = 120       # which chapters this sitting — "5–7", "the intro"
CRAFT_SOURCE = 160        # the one thing Craft is studying
LEARNING_SOURCE = 200     # what it was: title + chapters, a page, a URL
LEARNING_NOTE = 3000      # your own notes on it; the source alone is enough

# Writing
QUEST_NOTE = 8000         # a reflection written from a quest's write-step: the long one
QUEST_NOTE_PROMPT = 500   # the write-step being answered, stored with the note
JOURNAL_ENTRY = 4000      # a free-form daily entry

# Lists & money
REMINDER = 200
GROCERY_NAME = 120
MONEY_NOTE = 120
COMMITMENT_LABEL = 60     # a standing bill or allowance
PRIORITY_FOCUS = 60       # "abs", "passive income"


# What the nightly distiller may read
#
# A day's notes go up in one Gemini call (`llm.distill_learning`), so the prompt
# is as long as everything written that day — the per-note caps above bound one
# note, never the pile. This bounds the pile, and is the reason a quest note can
# afford to be 8000: room to write is a question about the editor, cost and
# context are a question about the digest, and they are now answered separately.
DIGEST_ENTRIES = 24000    # total characters of notes in one distil call
