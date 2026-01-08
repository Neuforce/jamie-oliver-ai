"""Lightweight PDF text extraction for text-only PDFs.

We intentionally keep extraction \"dumb\" here; Llama performs the understanding.
"""

from __future__ import annotations

from pathlib import Path

import pdfplumber


def extract_raw_text(pdf_path: Path) -> str:
    parts: list[str] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            txt = page.extract_text() or ""
            txt = txt.replace("\r\n", "\n").replace("\r", "\n").strip()
            if txt:
                parts.append(txt)
    return "\n\n".join(parts).strip()


def extract_blocks_with_coords(pdf_path: Path) -> list[dict]:
    """
    Extract line-like blocks with bounding boxes and naive column detection.
    Returns a list of dicts with:
      - text: joined text of the block
      - page: 0-based page index
      - x0,x1,top,bottom: bbox
      - column: "left" or "right" (heuristic by page width midpoint)
    """
    blocks: list[dict] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for p_idx, page in enumerate(pdf.pages):
            words = page.extract_words(use_text_flow=True, keep_blank_chars=False) or []
            if not words:
                continue
            # group words into lines by approximate y (top) proximity
            words.sort(key=lambda w: (w.get("top", 0), w.get("x0", 0)))
            lines: list[list[dict]] = []
            current: list[dict] = []
            last_top = None
            for w in words:
                top = w.get("top", 0)
                if last_top is None or abs(top - last_top) < 4:
                    current.append(w)
                else:
                    if current:
                        lines.append(current)
                    current = [w]
                last_top = top
            if current:
                lines.append(current)

            # split each line into left/right buckets by page_mid to avoid mixing columns
            page_mid = page.width / 2 if page.width else 300

            def line_bbox(line_words: list[dict]):
                xs0 = [w.get("x0", 0) for w in line_words]
                xs1 = [w.get("x1", 0) for w in line_words]
                tops = [w.get("top", 0) for w in line_words]
                bottoms = [w.get("bottom", 0) for w in line_words]
                return min(xs0), max(xs1), min(tops), max(bottoms)

            split_lines: list[tuple[str, list[dict]]] = []
            for ln in lines:
                left_words = [w for w in ln if (w.get("x0", 0) + w.get("x1", 0)) / 2 <= page_mid]
                right_words = [w for w in ln if (w.get("x0", 0) + w.get("x1", 0)) / 2 > page_mid]
                if left_words:
                    left_words.sort(key=lambda w: w.get("x0", 0))
                    split_lines.append(("left", left_words))
                if right_words:
                    right_words.sort(key=lambda w: w.get("x0", 0))
                    split_lines.append(("right", right_words))

            # merge adjacent lines into blocks per column (strict, no cross-column merge)
            blocks_page: list[dict] = []
            for col, ln_words in split_lines:
                x0, x1, top, bottom = line_bbox(ln_words)
                text = " ".join(w.get("text", "") for w in ln_words).strip()
                if not text:
                    continue
                if (
                    blocks_page
                    and blocks_page[-1]["column"] == col
                    and (top - blocks_page[-1]["bottom"]) < 6  # stricter vertical merge
                    and not text[0:1].isdigit()  # avoid merging numbered lines (likely steps)
                ):
                    blk = blocks_page[-1]
                    blk["text"] = (blk["text"] + " " + text).strip()
                    blk["x0"] = min(blk["x0"], x0)
                    blk["x1"] = max(blk["x1"], x1)
                    blk["bottom"] = max(blk["bottom"], bottom)
                else:
                    blocks_page.append(
                        {
                            "text": text,
                            "page": p_idx,
                            "x0": x0,
                            "x1": x1,
                            "top": top,
                            "bottom": bottom,
                            "column": col,
                        }
                    )
            blocks.extend(blocks_page)
    # sort all blocks by page, column (left before right), then top
    col_order = {"left": 0, "right": 1}
    blocks.sort(key=lambda b: (b["page"], col_order.get(b["column"], 2), b["top"]))
    return blocks


