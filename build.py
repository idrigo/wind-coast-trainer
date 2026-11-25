"""Inline src/* into one HTML page.

dist/trainer.html  page body for the Artifact publisher (no doctype/head; the host adds them)
dist/index.html    complete document for hosting on any web server
"""
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
SCRIPTS = ["bay.js", "wind.js", "wave.js", "ensemble.js", "draw.js", "ui.js", "scene3d.js", "map2d.js", "section.js", "chapters.js", "topics.js", "final.js", "app.js"]


def main() -> None:
    page = (SRC / "page.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = "\n".join((SRC / name).read_text(encoding="utf-8") for name in SCRIPTS if (SRC / name).exists())
    if "</script" in js:
        raise SystemExit("script source contains </script")
    qr = (SRC / "qr.svg").read_text(encoding="utf-8").strip()
    body = page.replace("/*STYLE*/", css).replace("/*QR*/", qr).replace("/*SCRIPT*/", js)
    DIST.mkdir(exist_ok=True)
    (DIST / "trainer.html").write_text(body, encoding="utf-8")
    full = (
        "<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
        + body.replace("<header", "</head>\n<body>\n<header", 1).replace("<script>\n", "<script>\nglobalThis.ALLOW_EMBED = true;\n", 1)
        + "</body>\n</html>\n"
    )
    (DIST / "index.html").write_text(full, encoding="utf-8")
    print(f"dist/trainer.html {len(body) // 1024} KB, dist/index.html {len(full) // 1024} KB")


if __name__ == "__main__":
    main()
