import sqlite3, os, pathlib

DB_PATH = os.environ.get("LC_DB_PATH") or str(pathlib.Path.home() / ".localcanvas" / "localcanvas.db")
db = sqlite3.connect(DB_PATH)
cur = db.cursor()
info = cur.execute("PRAGMA table_info(workflows)").fetchall()
for col in info:
    print(col)
db.close()
