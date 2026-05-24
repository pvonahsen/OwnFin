"""
Run once via: docker exec <container> python deactivate_sold.py
Deactivates positions that were sold but have no sell transactions recorded.
"""
import sqlite3, os

DB = os.environ.get("DB_PATH", "./data/dashboard.db")
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

TO_DEACTIVATE = [
    "tmc the metals rg",
    "dot",
    "sono group n.v.",
    "tia",
    "doga",
    "vsn",
]

updated = []
for name in TO_DEACTIVATE:
    cur = conn.execute(
        "UPDATE positions SET is_active=0 WHERE lower(name)=? AND is_active=1",
        (name,),
    )
    if cur.rowcount:
        updated.append(name)

conn.commit()
conn.close()

print(f"Deaktiviert ({len(updated)}): {', '.join(updated)}")
not_found = [n for n in TO_DEACTIVATE if n not in updated]
if not_found:
    print(f"Nicht gefunden (prüf Schreibweise): {', '.join(not_found)}")
