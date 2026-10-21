"""Build the single Lambda zip (backend/src/marketpulse -> build/backend.zip), deterministically.

Fixed timestamps, sorted entries and no compression keep the bytes identical across machines and
Python/zlib versions (laptop vs CI), so Terraform only redeploys on real code changes.
Usage: python scripts/build_lambda.py [output_path]
"""

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "backend" / "src"
EPOCH = (2020, 1, 1, 0, 0, 0)


def build(out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in (SRC / "marketpulse").rglob("*.py") if "__pycache__" not in p.parts)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as zf:
        for path in files:
            info = zipfile.ZipInfo(path.relative_to(SRC).as_posix(), date_time=EPOCH)
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())
    return out


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "build" / "backend.zip"
    print(build(target))
