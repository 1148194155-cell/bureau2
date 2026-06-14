import sqlite3, os, pathlib

DB_PATH = os.environ.get("LC_DB_PATH") or str(pathlib.Path.home() / ".localcanvas" / "localcanvas.db")
db = sqlite3.connect(DB_PATH)
cur = db.cursor()
rows = cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", [r[0] for r in rows])
db.close()
