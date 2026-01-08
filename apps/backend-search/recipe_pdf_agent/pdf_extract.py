"""PDF text extraction using PyMuPDF."""

from __future__ import annotations

import re
from pathlib import Path

import fitz  # PyMuPDF


_WS = re.compile(r"[ \t]+")
_MANY_NL = re.compile(r"\n{3,}")


def extract_text_from_pdf(pdf_path: Path) -> str:
    doc = fitz.open(str(pdf_path))
    parts: list[str] = []
    for page in doc:
        txt = page.get_text("text") or ""
        txt = txt.replace("\r\n", "\n").replace("\r", "\n")
        txt = _WS.sub(" ", txt)
        parts.append(txt.strip())
    text = "\n\n".join(p for p in parts if p)
    text = _MANY_NL.sub("\n\n", text)
    return text.strip()


