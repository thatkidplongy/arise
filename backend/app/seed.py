"""Initial quest definitions. Runs once on first boot (when quest_defs is empty)."""

from sqlalchemy.orm import Session

from .models import QuestDef

SEED_QUESTS = [
    # Daily quests — the non-negotiable core loop
    dict(id="d-train", title="Hunter Conditioning", desc="15 min of footwork, jump rope, or strength work", stat="STR", xp=10, cadence="daily", target=1),
    dict(id="d-sketch", title="Daily Sketch", desc="Draw for 20 minutes — anything counts", stat="CRE", xp=10, cadence="daily", target=1),
    dict(id="d-meditate", title="Inner Gate", desc="Meditate for 10 minutes", stat="SPI", xp=10, cadence="daily", target=1,
         requires_log=True, log_prompt="What came up in the stillness — anything to notice or let go of?"),
    dict(id="d-connect", title="Send a Signal", desc="Reach out to a friend or family member", stat="CHA", xp=10, cadence="daily", target=1),
    dict(id="d-read", title="Grimoire Study", desc="Read for 20 minutes", stat="INT", xp=10, cadence="daily", target=1,
         requires_log=True, log_prompt="What's one idea worth keeping from today's reading?"),
    dict(id="d-jp", title="Japanese", desc="Study Japanese — kana, kanji, grammar or vocab", stat="INT", xp=10, cadence="daily", target=1),
    # Weekly quests — the raids
    dict(id="w-badminton", title="Dungeon Raid: Badminton", desc="Play a badminton session", stat="STR", xp=40, cadence="weekly", target=2),
    dict(id="w-hangout", title="Party Gathering", desc="Spend real time with people you like", stat="CHA", xp=50, cadence="weekly", target=1),
    dict(id="w-piece", title="Finish a Piece", desc="Complete one drawing, start to finish", stat="CRE", xp=40, cadence="weekly", target=1),
    dict(id="w-tome", title="Clear the Tome", desc="Finish 3 chapters of your current book", stat="INT", xp=40, cadence="weekly", target=1,
         requires_log=True, log_prompt="The single idea from this week's reading you don't want to forget?"),
    dict(id="w-still", title="Deep Stillness", desc="One 30-minute meditation session", stat="SPI", xp=30, cadence="weekly", target=1,
         requires_log=True, log_prompt="Looking back on the week — what do you want to carry forward?"),
    # Side quests — optional bonus XP, once per week each
    dict(id="s-drill", title="New Technique", desc="Practice a badminton shot or drill you struggle with", stat="STR", xp=15, cadence="side", target=1),
    dict(id="s-brave", title="Beyond the Comfort Zone", desc="Draw a subject you usually avoid", stat="CRE", xp=15, cadence="side", target=1),
    dict(id="s-nature", title="Nature Attunement", desc="Meditate or take a mindful walk outdoors", stat="SPI", xp=15, cadence="side", target=1,
         requires_log=True, log_prompt="What did you notice out there — in the world, or in yourself?"),
    dict(id="s-ally", title="New Ally", desc="Have a real conversation with someone new", stat="CHA", xp=15, cadence="side", target=1),
    dict(id="s-code", title="Arcane Study: Code", desc="30 minutes learning to code (building this app counts)", stat="INT", xp=15, cadence="side", target=1,
         requires_log=True, log_prompt="What did you figure out, or get unstuck on?"),
    # Wealth — learning to make money: fundamentals, side income, monetising your
    # skills, and managing/growing what you have.
    dict(id="d-wealth", title="Ledger Study", desc="10 min toward earning or managing money", stat="WLT", xp=10, cadence="daily", target=1,
         requires_log=True, log_prompt="What did you learn or decide about money today?"),
    dict(id="w-wealth", title="Wealth Milestone", desc="One real step toward making money this week", stat="WLT", xp=40, cadence="weekly", target=1,
         requires_log=True, log_prompt="What did this week's money move teach you?"),
    dict(id="s-wealth", title="Extra Coin", desc="A quick money-making action", stat="WLT", xp=15, cadence="side", target=1,
         requires_log=True, log_prompt="An income idea or money insight worth capturing?"),
    # Craft (CFT) — deliberate engineering practice toward Senior: fluency →
    # patterns → system design. The daily is a small deep-work floor; interview
    # mode (a Player toggle) shifts the weekly/side/daily toward interview prep.
    dict(id="d-craft", title="The Forge", desc="Deliberate coding practice", stat="CFT", xp=10, cadence="daily", target=1,
         requires_log=True, log_prompt="What's the one thing you learned from today's rep?"),
    dict(id="w-craft", title="Master Work", desc="One real step toward Senior this week", stat="CFT", xp=40, cadence="weekly", target=1),
    dict(id="s-craft", title="Sharpen the Axe", desc="A focused craft rep", stat="CFT", xp=15, cadence="side", target=1),
]


def seed_quests(db: Session) -> None:
    """Insert any missing quest definitions, and keep the log flag (requires_log +
    log_prompt) in sync with the seed. Additive and idempotent: a quest's identity
    and the player's *progress* against it are never touched — only this bit of
    definition metadata is reconciled, so flipping a quest's log flag in the seed
    reaches a database that was populated before the flag existed."""
    existing = {row.id: row for row in db.query(QuestDef).all()}
    changed = False
    for sort, q in enumerate(SEED_QUESTS):
        row = existing.get(q["id"])
        if row is None:
            db.add(QuestDef(sort=sort, **q))
            changed = True
            continue
        rl = q.get("requires_log", False)
        lp = q.get("log_prompt", "")
        if row.requires_log != rl or row.log_prompt != lp:
            row.requires_log = rl
            row.log_prompt = lp
            changed = True
    if changed:
        db.commit()
