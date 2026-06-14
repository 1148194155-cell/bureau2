import sqlite3, json, os, pathlib

DB_PATH = os.environ.get("LC_DB_PATH") or str(pathlib.Path.home() / ".localcanvas" / "localcanvas.db")
WID = os.environ.get("LC_WORKFLOW_ID") or "35"
db = sqlite3.connect(DB_PATH)
cur = db.cursor()
row = cur.execute("SELECT id, name, nodes, edges FROM workflows WHERE id=?", (WID,)).fetchone()
if row:
    print("ID:", row[0])
    print("name:", repr(row[1]))
    nodes = json.loads(row[2])
    edges = json.loads(row[3])
    for n in nodes:
        print("node " + n["id"] + ":", repr(n["data"]["label"]))
    print("edges count:", len(edges))
else:
    print("Workflow not found: " + WID)
db.close()
