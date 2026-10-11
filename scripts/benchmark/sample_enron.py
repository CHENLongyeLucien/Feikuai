"""Draw a fixed-seed sample of unique Enron emails from the pinned Parquet shards.

Usage: python3 -I scripts/benchmark/sample_enron.py <parquet-dir> <output.jsonl> [count]
Requires pyarrow. Duplicates across mail folders (sent, all_documents, ...) are removed by
subject+body digest before sampling, so each message is counted once.
"""
import hashlib
import json
import random
import sys
from pathlib import Path

import pyarrow.parquet as pq

SEED = 20261011


def main(source, target, count):
    rows = []
    for path in sorted(Path(source).glob("*.parquet")):
        part = pq.read_table(path, columns=["message_id", "subject", "from", "body", "file_name"]).to_pylist()
        rows.extend(part)
    order = list(range(len(rows)))
    random.Random(SEED).shuffle(order)
    seen, sample = set(), []
    for index in order:
        row = rows[index]
        body = (row["body"] or "").strip()
        if len(body) < 20:
            continue
        digest = hashlib.sha256(((row["subject"] or "") + "\n" + body).encode("utf-8", "replace")).hexdigest()
        if digest in seen:
            continue
        seen.add(digest)
        sample.append({"id": f"enron-{index}", "subject": (row["subject"] or "")[:160], "sender": (row["from"] or "")[:254],
                       "folder": row["file_name"], "text": body[:36000]})
        if len(sample) >= count:
            break
    with open(target, "w", encoding="utf-8") as out:
        for row in sample:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"corpusRows": len(rows), "sampled": len(sample), "seed": SEED}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 5000)
