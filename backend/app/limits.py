"""How long each piece of written text may be.

One number per thing, named once. These were spelled twice — as `max_length` on
the Pydantic field that rejects an over-long request, and again as a `[:n]` slice
in the service function that stores it — which is two places to change and no way
to notice when only one of them moved. The pair is deliberate and both halves
stay: the schema refuses what the app should never have sent, and the slice is
the belt-and-braces for anything that reaches the service another way (a script,
a repair job). They just agree by construction now.

`src/consts.ts` mirrors the three the editor enforces as you type, so it can stop
you at the limit rather than letting the server quietly trim or reject what you
wrote. Python can't be imported from TypeScript, so that copy is kept by hand —
change a number here and change it there.
"""

# Reading & study
READING_LABEL = 120       # which chapters this sitting — "5–7", "the intro"
CRAFT_SOURCE = 160        # the one thing Craft is studying
LEARNING_SOURCE = 200     # what it was: title + chapters, a page, a URL
LEARNING_NOTE = 4000      # your own notes on it; the source alone is enough

# Writing
QUEST_NOTE = 2000         # a reflection written from a quest's write-step
QUEST_NOTE_PROMPT = 500   # the write-step being answered, stored with the note
JOURNAL_ENTRY = 5000      # a free-form daily entry

# Lists & money
REMINDER = 200
GROCERY_NAME = 120
MONEY_NOTE = 120
COMMITMENT_LABEL = 60     # a standing bill or allowance
PRIORITY_FOCUS = 60       # "abs", "passive income"
