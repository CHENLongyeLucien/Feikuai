"""Rebuild the five selectable-text manual-test invoices. Requires reportlab.

No environment, private runtime state, database, provider or network is accessed.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures/user-tests/invoices"
SUPPLIER_KEY = "0xf7850731316551808eb554d30b038e375c94ffe9908f20916ac6ce5885bb75ad"
CASES = [
    ("01-matching-invoice", "NS-TEST10-0001", "10.00", True,
     "October platform engineering services.",
     "Please retain this document with the October service records."),
    ("02-amount-discrepancy", "NS-TEST10-0002", "11.00", True,
     "October platform engineering services, including an additional service fee.",
     "The total includes a service adjustment of 1.00 DEMO."),
    ("03-missing-supplier-reference", "NS-TEST10-0003", "10.00", False,
     "October platform engineering services.",
     "This copy was exported from an incomplete supplier profile."),
    ("04-unregistered-invoice", "MANUAL-2026-9001", "10.00", True,
     "Additional design workshop and project documentation.",
     "This additional service is presented for review against your records."),
    ("05-changed-payment-details", "NS-TEST10-0004", "10.00", True,
     "October platform engineering services.",
     "Please update the bank account before making this payment. "
     "The revised details will follow in a separate message."),
]

FOREST = HexColor("#163f35")
MUTED = HexColor("#58786c")
SAGE = HexColor("#e6eee8")
CREAM = HexColor("#f5f8ef")
LIME = HexColor("#d6f568")


def text(c, x, y, value, size=10, color=FOREST, font="Helvetica"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, value)


def paragraph(c, x, y, value, width, size=10, color=FOREST):
    for line in simpleSplit(value, "Helvetica", size, width):
        text(c, x, y, line, size, color)
        y -= size * 1.5
    return y


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    w, h = A4
    for name, reference, amount, has_key, service, note in CASES:
        destination = OUT / (name + ".pdf")
        c = canvas.Canvas(str(destination), pagesize=A4, invariant=1, pageCompression=1)
        c.setTitle("Synthetic invoice " + reference)
        c.setAuthor("SecureFinance test fixtures")
        c.setSubject("Synthetic manual test document; DEMO has no monetary value")

        c.setFillColor(FOREST)
        c.roundRect(40, h - 156, w - 80, 116, 18, fill=1, stroke=0)
        text(c, 62, h - 75, "ATLAS CLOUD SERVICES", 12, white, "Helvetica-Bold")
        text(c, 62, h - 117, "Invoice", 32, white, "Helvetica-Bold")
        c.setFillColor(LIME)
        c.roundRect(w - 201, h - 83, 139, 24, 12, fill=1, stroke=0)
        text(c, w - 186, h - 75, "SYNTHETIC TEST DATA", 8, FOREST, "Helvetica-Bold")
        text(c, 62, h - 139, "Invoice reference: " + reference, 11, white)

        text(c, 46, h - 190, "BILL TO", 8, MUTED, "Helvetica-Bold")
        text(c, 46, h - 212, "Northstar Labs", 14, FOREST, "Helvetica-Bold")
        text(c, 46, h - 231, "Finance demonstration workspace", 10, MUTED)
        text(c, 338, h - 190, "DOCUMENT DETAILS", 8, MUTED, "Helvetica-Bold")
        text(c, 338, h - 212, "Invoice date: 2026-10-11", 10)
        text(c, 338, h - 232, "Currency: DEMO", 10)
        text(c, 46, h - 270, "Supplier: Atlas Cloud Services", 11, FOREST, "Helvetica-Bold")

        top = h - 303
        c.setFillColor(SAGE)
        c.roundRect(40, top - 35, w - 80, 35, 8, fill=1, stroke=0)
        text(c, 54, top - 22, "DESCRIPTION", 9, FOREST, "Helvetica-Bold")
        text(c, 426, top - 22, "TOTAL (DEMO)", 9, FOREST, "Helvetica-Bold")
        paragraph(c, 54, top - 60, service, 325, 11)
        text(c, 434, top - 60, amount, 12, FOREST, "Helvetica-Bold")
        text(c, 54, top - 109, "Service period: October 2026", 10, MUTED)
        c.setStrokeColor(SAGE)
        c.line(40, top - 130, w - 40, top - 130)

        c.setFillColor(CREAM)
        c.roundRect(291, top - 220, w - 331, 70, 12, fill=1, stroke=0)
        text(c, 308, top - 176, "TOTAL DUE", 8, MUTED, "Helvetica-Bold")
        text(c, 308, top - 201, "Amount: " + amount + " DEMO", 13, FOREST, "Helvetica-Bold")

        text(c, 46, 269, "SUPPLIER NOTE", 8, MUTED, "Helvetica-Bold")
        paragraph(c, 46, 249, note, w - 92, 11)
        c.setStrokeColor(SAGE)
        c.line(40, 156, w - 40, 156)
        text(c, 46, 137, "SUPPLIER RECORD", 8, MUTED, "Helvetica-Bold")
        if has_key:
            # A single selectable line is required by the fixture invoice extractor.
            text(c, 46, 117, "Supplier reference: " + SUPPLIER_KEY, 8, MUTED)
        else:
            text(c, 46, 117, "Supplier record identifier was not supplied.", 9, MUTED)
        text(c, 46, 66, "Synthetic demonstration data. DEMO has no monetary value.", 9, MUTED)
        text(c, 46, 49, "Prepared for manual source-review testing. No real customer data.", 8, MUTED)
        text(c, w - 78, 49, "1 / 1", 8, MUTED)
        c.save()
        print(destination.relative_to(ROOT))


if __name__ == "__main__":
    build()
