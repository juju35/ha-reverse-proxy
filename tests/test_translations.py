"""Every translation file has exactly the keys and placeholders of the English one."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

TRANSLATIONS = Path(__file__).parent.parent / "custom_components" / "zoraxy" / "translations"
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _flatten(data: dict, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in data.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            out.update(_flatten(value, f"{path}."))
        else:
            out[path] = value
    return out


def _load(lang: str) -> dict[str, str]:
    return _flatten(json.loads((TRANSLATIONS / f"{lang}.json").read_text(encoding="utf-8")))


def test_languages() -> None:
    """The 10 first languages (+pt-BR) and Romanian to Greek."""
    expected = {"en", "fr", "de", "es", "sr", "sr-Latn", "it", "nl", "pt", "pt-BR", "pl"}
    expected |= {"ro", "da", "sv", "bg", "ru", "uk", "hu", "ga", "sk", "cs", "sl", "mt", "lv", "el"}
    assert {p.stem for p in TRANSLATIONS.glob("*.json")} >= expected


@pytest.mark.parametrize("lang", sorted(p.stem for p in TRANSLATIONS.glob("*.json") if p.stem != "en"))
def test_parity(lang: str) -> None:
    """Same keys as English, same placeholders in every string, no empty string."""
    en, other = _load("en"), _load(lang)
    assert sorted(other) == sorted(en)
    for key, text in en.items():
        assert other[key].strip(), f"{lang}: {key} is empty"
        assert sorted(PLACEHOLDER.findall(other[key])) == sorted(PLACEHOLDER.findall(text)), f"{lang}: {key}"


# Serbian Cyrillic letter by letter, then its Latin spelling (љ, њ and џ take two letters).
_SERBIAN = "аaбbвvгgдdђđеeжžзzиiјjкkлlљljмmнnњnjоoпpрrсsтtћćуuфfхhцcчčџdžшš"
_TO_LATIN = dict(re.findall(r"([а-џ])([^а-џ]+)", _SERBIAN))
_TO_LATIN |= {c.upper(): lat.capitalize() for c, lat in _TO_LATIN.items()}
# Left in Latin script in both files: the product name, acronyms, placeholders and literal values.
_KEPT_LATIN = re.compile(r"Zoraxy|HTTPS|URL|TLS|ACME|DNS|\{\w+\}|\btrue\b|\bfalse\b|\"example\.com\"")


def test_serbian_scripts_match() -> None:
    """The Cyrillic and Latin Serbian files say the same thing, letter for letter."""
    cyrillic, latin = _load("sr"), _load("sr-Latn")
    for key, text in cyrillic.items():
        assert "".join(_TO_LATIN.get(ch, ch) for ch in text) == latin[key], key


def test_serbian_scripts_are_not_mixed() -> None:
    """No Latin letter in the Cyrillic file, no Cyrillic letter in the Latin one (names and acronyms aside)."""
    for key, text in _load("sr").items():
        assert not re.search(r"[A-Za-z]", _KEPT_LATIN.sub("", text)), f"sr: {key}"
    for key, text in _load("sr-Latn").items():
        assert not re.search(r"[Ѐ-ӿ]", text), f"sr-Latn: {key}"


def test_brazilian_portuguese_is_european_portuguese() -> None:
    """pt-BR uses the European Portuguese texts: Home Assistant does not fall back from pt-BR to pt."""
    assert _load("pt-BR") == _load("pt")
