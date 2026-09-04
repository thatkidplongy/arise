"""Initial quest definitions, and the XP a slot is worth.

XP is tiered by cadence rather than by effort: a daily is worth the most, then a
weekly, then a side quest. That inverts effort-per-card on purpose — a weekly raid
is a bigger sitting than a 20-minute daily — because what the number is meant to
reward is the thing that actually moves a life, which is the quest that comes back
every day."""

from sqlalchemy.orm import Session

from .models import QuestDef

SEED_QUESTS = [
    # Daily quests — the non-negotiable core loop
    dict(id="d-train", title="Hunter Conditioning", desc="15 min of footwork, jump rope, or strength work", stat="STR", xp=25, cadence="daily", target=1),
    dict(id="d-sketch", title="Daily Sketch", desc="Draw for 20 minutes — anything counts", stat="CRE", xp=25, cadence="daily", target=1),
    dict(id="d-meditate", title="Inner Gate", desc="Meditate for 10 minutes", stat="SPI", xp=25, cadence="daily", target=1),
    dict(id="d-read", title="Grimoire Study", desc="Read for 20 minutes", stat="INT", xp=25, cadence="daily", target=1),
    dict(id="d-jp", title="Japanese", desc="Study Japanese — kana, kanji, grammar or vocab", stat="INT", xp=25, cadence="daily", target=1),
    # Weekly quests — the raids
    dict(id="w-badminton", title="Dungeon Raid: Badminton", desc="Play a badminton session", stat="STR", xp=20, cadence="weekly", target=1),
    dict(id="w-hangout", title="Party Gathering", desc="Spend real time with people you like", stat="CHA", xp=20, cadence="weekly", target=1),
    dict(id="w-piece", title="Finish a Piece", desc="Complete one drawing, start to finish", stat="CRE", xp=20, cadence="weekly", target=1),
    dict(id="w-tome", title="Clear the Tome", desc="Finish 3 chapters of your current book", stat="INT", xp=20, cadence="weekly", target=1),
    dict(id="w-still", title="Deep Stillness", desc="One 30-minute meditation session", stat="SPI", xp=20, cadence="weekly", target=1),
    # Side quests — optional bonus XP, once per week each
    dict(id="s-drill", title="New Technique", desc="Practice a badminton shot or drill you struggle with", stat="STR", xp=10, cadence="side", target=1),
    dict(id="s-brave", title="Beyond the Comfort Zone", desc="Draw a subject you usually avoid", stat="CRE", xp=10, cadence="side", target=1),
    dict(id="s-nature", title="Nature Attunement", desc="Meditate or take a mindful walk outdoors", stat="SPI", xp=10, cadence="side", target=1),
    dict(id="s-ally", title="New Ally", desc="Have a real conversation with someone new", stat="CHA", xp=10, cadence="side", target=1),
    dict(id="s-code", title="Arcane Study: Code", desc="30 minutes learning to code (building this app counts)", stat="INT", xp=10, cadence="side", target=1),
    # Wealth — learning to make money: fundamentals, side income, monetising your
    # skills, and managing/growing what you have.
    dict(id="w-wealth", title="Wealth Milestone", desc="One real step toward making money this week", stat="WLT", xp=20, cadence="weekly", target=1),
    dict(id="s-wealth", title="Extra Coin", desc="A quick money-making action", stat="WLT", xp=10, cadence="side", target=1),
    # Craft (CFT) — deliberate engineering practice toward Senior: fluency →
    # patterns → system design. The daily is a small deep-work floor; interview
    # mode (a Player toggle) shifts the weekly/side/daily toward interview prep.
    dict(id="d-craft", title="The Architect", desc="System design, from your own notes", stat="CFT", xp=25, cadence="daily", target=1),
    dict(id="w-craft", title="Master Work", desc="One real step toward Senior this week", stat="CFT", xp=20, cadence="weekly", target=1),
    dict(id="s-craft", title="Sharpen the Axe", desc="A focused craft rep", stat="CFT", xp=10, cadence="side", target=1),
]


def seed_quests(db: Session) -> None:
    """Insert any missing quest definitions, and keep every slot's XP in step.

    Additive for rows: a quest already in the database keeps its progress, and new
    quests reach a database seeded before they existed. XP is the one field pushed
    onto existing rows — this table is where a slot's worth is decided, and without
    the reconciliation a rescale would only ever reach a fresh database, never the
    one actually being played. Completions store the XP they were awarded, so
    rescaling changes what future completions are worth and never rewrites history."""
    by_id = {q.id: q for q in db.query(QuestDef).all()}
    changed = False
    for sort, q in enumerate(SEED_QUESTS):
        row = by_id.get(q["id"])
        if row is None:
            db.add(QuestDef(sort=sort, **q))
            changed = True
        elif row.xp != q["xp"]:
            row.xp = q["xp"]
            changed = True
    if changed:
        db.commit()
