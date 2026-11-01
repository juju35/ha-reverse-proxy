"""The screenshot script rewrites a file only when its decoded pixels change."""

import importlib.util
import io
from pathlib import Path

import pytest

Image = pytest.importorskip("PIL.Image")

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "screenshots.py"


def _script():
    spec = importlib.util.spec_from_file_location("zoraxy_screenshots", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _png(color, size=(4, 3), **save):
    buf = io.BytesIO()
    Image.new("RGBA", size, color).save(buf, "PNG", **save)
    return buf.getvalue()


def test_same_picture_with_other_png_bytes_is_not_rewritten(tmp_path):
    script = _script()
    path = tmp_path / "card.png"
    path.write_bytes(_png((10, 20, 30, 255), compress_level=1))
    before = path.read_bytes()
    other_bytes = _png((10, 20, 30, 255), compress_level=9)
    assert other_bytes != before  # same pixels, different encoding
    assert script.save_if_changed(other_bytes, path) is False
    assert path.read_bytes() == before


def test_changed_pixels_size_or_missing_file_are_written(tmp_path):
    script = _script()
    path = tmp_path / "card.png"
    assert script.save_if_changed(_png((10, 20, 30, 255)), path) is True  # missing file
    changed = _png((10, 20, 31, 255))
    assert script.save_if_changed(changed, path) is True
    assert path.read_bytes() == changed
    taller = _png((10, 20, 31, 255), size=(4, 4))
    assert script.save_if_changed(taller, path) is True
    assert path.read_bytes() == taller
