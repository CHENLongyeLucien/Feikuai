"""Convert Nazario phishing mailboxes (mbox) into JSONL with subject, sender and readable text.

Usage: python3 -I scripts/benchmark/parse_nazario.py <mailbox-dir> <output.jsonl>

Standard library only. HTML bodies are converted to text the way a mailbox integration
would present them, keeping each link target inline as "label (url)" so that link-based
rules see the same URLs a reader would. Attachments are ignored.
"""
import hashlib
import html
import json
import mailbox
import re
import sys
from email.header import decode_header, make_header
from html.parser import HTMLParser
from pathlib import Path


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.skip, self.href = [], 0, None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.skip += 1
        if tag == "a":
            self.href = dict(attrs).get("href")
        if tag in ("br", "p", "div", "tr", "li", "h1", "h2", "h3", "table"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head") and self.skip:
            self.skip -= 1
        if tag == "a" and self.href:
            if self.href.lower().startswith(("http://", "https://")):
                self.parts.append(f" ({self.href})")
            self.href = None

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(markup):
    parser = _Text()
    try:
        parser.feed(markup)
        parser.close()
    except Exception:
        return re.sub(r"<[^>]+>", " ", html.unescape(markup))
    return "".join(parser.parts)


def header(value):
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value))).strip()
    except Exception:
        return str(value).strip()


def payload_text(part):
    raw = part.get_payload(decode=True)
    if raw is None:
        return ""
    for charset in (part.get_content_charset(), "utf-8", "latin-1"):
        if not charset:
            continue
        try:
            return raw.decode(charset, errors="strict")
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def body(message):
    plain, rich = [], []
    for part in message.walk() if message.is_multipart() else [message]:
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue
        kind = part.get_content_type()
        if kind == "text/plain":
            plain.append(payload_text(part))
        elif kind == "text/html":
            rich.append(html_to_text(payload_text(part)))
    text = "\n".join(plain) if any(p.strip() for p in plain) else "\n".join(rich)
    text = re.sub(r"[ \t ]+", " ", text)
    return re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()


def main(source, target):
    seen, rows, skipped = set(), [], 0
    for path in sorted(Path(source).glob("phishing-20*")):
        for index, message in enumerate(mailbox.mbox(str(path), create=False)):
            try:
                text = body(message)
            except Exception:
                skipped += 1
                continue
            subject = header(message.get("Subject"))
            if len(text) < 20:
                skipped += 1
                continue
            digest = hashlib.sha256((subject + "\n" + text).encode("utf-8", "replace")).hexdigest()
            if digest in seen:
                skipped += 1
                continue
            seen.add(digest)
            rows.append({"id": f"nazario-{path.name}-{index:04d}", "year": path.name[-4:], "subject": subject[:160],
                         "sender": header(message.get("From"))[:254], "text": text[:36000]})
    with open(target, "w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"messages": len(rows), "skipped_empty_duplicate_or_unparseable": skipped}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
