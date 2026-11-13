"""Re-transcribe the rendered cut around every seam and compare with the EDL.

A join can leave a word said twice, or clip the head or tail of a clause.
Transcribing the whole output hides that (ASR smooths over it), so this cuts
a short window around each seam out of the *rendered* file, joins the windows
with silence into one wav, and sends that to Scribe in a single call.

For every seam it writes what the EDL expected (source transcript words at
the end of block N and the start of block N+1) next to what was heard, and
flags:
  - REPEAT   a run of 3+ characters heard twice in a row that the EDL did
             not ask for (a word said twice across the join)
  - MISSING  the last characters of block N or the first of block N+1 are
             not heard (a clipped tail or head)

Checks run on the joined text with spaces and punctuation stripped, because
Scribe returns Thai as grapheme clusters, not words.

The flags are hints for the agent. Read the expected/heard pairs yourself:
a dropped negation inverts the sentence and no string check will catch it.

This transcribes the render, not the sources, so it does not break the
cache-per-source rule.

Usage:
    python helpers/seam_check.py <edl.json> <rendered.mp4>
    python helpers/seam_check.py <edl.json> <rendered.mp4> --pad 1.5 --language th
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import unicodedata
import wave
from pathlib import Path

from transcribe import call_scribe, load_api_key

GAP_S = 1.0          # silence between windows in the joined wav
EDGE_CHARS = 6       # expected characters checked on each side of a seam
SAMPLE_RATE = 16000


def norm(text: str) -> str:
    """Lowercase, drop punctuation and whitespace. Thai has no spaces, so
    comparisons run on the joined string, not on word lists. Filters by
    Unicode category: \\W would also drop Thai vowel and tone marks (Mn)."""
    return "".join(c for c in text.lower() if unicodedata.category(c)[0] not in "PSZC")


def words_in_range(transcript: dict, t_start: float, t_end: float) -> list[dict]:
    return [
        w for w in transcript.get("words", [])
        if w.get("type") == "word"
        and w.get("start") is not None and w.get("end") is not None
        and w["end"] > t_start and w["start"] < t_end
    ]


def extract_window(video: Path, start: float, dur: float, dest: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(video),
         "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(dest)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def join_wavs(parts: list[Path], dest: Path) -> list[float]:
    """Concatenate wavs with GAP_S of silence between them.
    Returns the start time of each part inside the joined file."""
    offsets: list[float] = []
    silence = b"\x00\x00" * int(GAP_S * SAMPLE_RATE)
    pos = 0.0
    with wave.open(str(dest), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        for i, p in enumerate(parts):
            if i:
                out.writeframes(silence)
                pos += GAP_S
            offsets.append(pos)
            with wave.open(str(p), "rb") as w:
                n = w.getnframes()
                out.writeframes(w.readframes(n))
            pos += n / SAMPLE_RATE
    return offsets


def main() -> None:
    ap = argparse.ArgumentParser(description="Verify seams of a rendered cut by re-transcribing them")
    ap.add_argument("edl", type=Path)
    ap.add_argument("video", type=Path, help="Rendered output (preview or final)")
    ap.add_argument("--edit-dir", type=Path, default=None, help="Default: the EDL's directory")
    ap.add_argument("--pad", type=float, default=1.5, help="Seconds each side of a seam (default 1.5)")
    ap.add_argument("--language", type=str, default=None, help="ISO code, e.g. 'th'. Omit to auto-detect.")
    args = ap.parse_args()

    edl_path = args.edl.resolve()
    video = args.video.resolve()
    edit_dir = (args.edit_dir or edl_path.parent).resolve()
    edl = json.loads(edl_path.read_text(encoding="utf-8"))
    ranges = edl["ranges"]
    if len(ranges) < 2:
        print("one range, no seams")
        return

    # Seam i joins ranges[i] and ranges[i+1], at the output time where ranges[i] ends.
    seams: list[float] = []
    t = 0.0
    for r in ranges[:-1]:
        t += float(r["end"]) - float(r["start"])
        seams.append(t)

    transcripts: dict[str, dict] = {}
    for name in {r["source"] for r in ranges}:
        p = edit_dir / "transcripts" / f"{name}.json"
        transcripts[name] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        parts, windows = [], []
        for i, s in enumerate(seams):
            a = max(0.0, s - args.pad)
            windows.append((a, s + args.pad))
            part = tmp_dir / f"seam_{i:03d}.wav"
            extract_window(video, a, s + args.pad - a, part)
            parts.append(part)
        joined = tmp_dir / "seams.wav"
        offsets = join_wavs(parts, joined)
        print(f"  {len(seams)} seams, uploading {joined.stat().st_size / 1e6:.1f} MB", flush=True)
        payload = call_scribe(joined, load_api_key(), args.language)

    verify_dir = edit_dir / "verify"
    verify_dir.mkdir(parents=True, exist_ok=True)
    (verify_dir / "seams_scribe.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    heard_words = [w for w in payload.get("words", []) if w.get("type") == "word"]
    lines = [f"# Seam check — {video.name}", ""]
    n_flagged = 0
    for i, s in enumerate(seams):
        lo = offsets[i]
        hi = lo + (windows[i][1] - windows[i][0])
        heard = [w["text"].strip() for w in heard_words if lo <= w["start"] < hi]
        heard_norm = norm("".join(heard))

        left, right = ranges[i], ranges[i + 1]
        tail = words_in_range(transcripts[left["source"]], float(left["end"]) - args.pad, float(left["end"]))
        head = words_in_range(transcripts[right["source"]], float(right["start"]), float(right["start"]) + args.pad)
        tail_txt = [w["text"].strip() for w in tail]
        head_txt = [w["text"].strip() for w in head]

        flags = []
        expected_norm = norm("".join(tail_txt + head_txt))
        for m in re.finditer(r"(.{3,}?)\1", heard_norm):
            if m.group(0) not in expected_norm:
                flags.append(f"REPEAT '{m.group(1)}'")
        tail_end = norm("".join(tail_txt))[-EDGE_CHARS:]
        head_start = norm("".join(head_txt))[:EDGE_CHARS]
        for label, edge in (("tail", tail_end), ("head", head_start)):
            if edge and edge not in heard_norm:
                flags.append(f"MISSING {label} '{edge}'")
        if not transcripts[left["source"]] or not transcripts[right["source"]]:
            flags.append("NO-SOURCE-TRANSCRIPT")
        n_flagged += bool(flags)

        m, sec = divmod(s, 60)
        lines += [
            f"## Seam {i + 1} @ {int(m):02d}:{sec:05.2f}  "
            f"({left['source']} {left['end']} → {right['source']} {right['start']})"
            + ("  ⚠ " + ", ".join(flags) if flags else "  ok"),
            f"- expected: {' '.join(tail_txt)} ‖ {' '.join(head_txt)}",
            f"- heard:    {' '.join(heard)}",
            "",
        ]

    report = verify_dir / "seams.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"seam report → {report}  ({n_flagged}/{len(seams)} flagged)")
    sys.exit(1 if n_flagged else 0)


if __name__ == "__main__":
    main()
