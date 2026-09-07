"""Export the CPython 3.13 Unicode behavior used by the pySBD reference."""

import _sre
import argparse
import json
from pathlib import Path
import platform
from re._casefix import _EXTRA_CASES
import sys
import unicodedata


def ranges(values):
    result = []
    for value in values:
        if result and result[-1] + 1 == value:
            result[-1] = value
        else:
            result.extend((value, value))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if (
        platform.python_implementation() != "CPython"
        or sys.version_info[:2] != (3, 13)
        or unicodedata.unidata_version != "15.1.0"
    ):
        raise RuntimeError("Use CPython 3.13 with Unicode 15.1.0.")

    classes = {
        "word": [],
        "decimal": [],
        "whitespace": [],
        "uppercase": [],
        "cased": [],
        "caseIgnorable": [],
        "identifierStart": [],
        "identifierContinue": [],
    }
    lower_keys = []
    lower_values = []
    parents = {}

    def representative(code):
        while code in parents and parents[code] != code:
            parents[code] = parents[parents[code]]
            code = parents[code]
        return code

    def join(left, right):
        parents.setdefault(left, left)
        parents.setdefault(right, right)
        left, right = representative(left), representative(right)
        parents[max(left, right)] = min(left, right)

    for code in range(0x110000):
        character = chr(code)
        cased = character.isupper() or character.islower() or character.istitle()
        if character.isalnum() or character == "_":
            classes["word"].append(code)
        if character.isdecimal():
            classes["decimal"].append(code)
        if character.isspace():
            classes["whitespace"].append(code)
        if character.isupper():
            classes["uppercase"].append(code)
        if cased:
            classes["cased"].append(code)
        if character.isidentifier():
            classes["identifierStart"].append(code)
        if ("A" + character).isidentifier():
            classes["identifierContinue"].append(code)

        # Final sigma ignores Case_Ignorable characters, including some cased
        # characters. These probes use Python's own context-sensitive mapping.
        if cased:
            ignorable = ("AΣ" + character).lower()[1] == "ς"
        else:
            ignorable = ("AΣ" + character + "A").lower()[1] == "σ"
        if ignorable:
            classes["caseIgnorable"].append(code)

        lower = character.lower()
        if lower != character:
            lower_keys.append(code)
            lower_values.append(lower)

        regex_lower = _sre.unicode_tolower(code)
        assert regex_lower == ord(lower[0])
        if regex_lower != code:
            join(code, regex_lower)

    for code, equivalents in _EXTRA_CASES.items():
        for equivalent in equivalents:
            join(code, equivalent)

    fold = []
    for code in sorted(parents):
        canonical = representative(code)
        if canonical != code:
            fold.extend((code, canonical))

    result = {
        "unicodeVersion": unicodedata.unidata_version,
        "pythonVersion": "3.13",
        **{name: ranges(values) for name, values in classes.items()},
        "lowercaseKeys": lower_keys,
        "lowercaseValues": lower_values,
        "casefold": fold,
    }
    decimal_ranges = result["decimal"]
    for index in range(0, len(decimal_ranges), 2):
        start, end = decimal_ranges[index : index + 2]
        assert (end - start + 1) % 10 == 0
        for code in range(start, end + 1):
            assert unicodedata.decimal(chr(code)) == (code - start) % 10

    destination = Path(__file__).resolve().parents[1] / "src" / "unicode-data.json"
    serialized = json.dumps(result, ensure_ascii=True, separators=(",", ":")) + "\n"
    if args.check:
        if not destination.exists() or destination.read_text(encoding="utf-8") != serialized:
            raise SystemExit(f"Unicode data differs from CPython 3.13: {destination}")
        print(f"Verified Unicode {unicodedata.unidata_version} data")
    else:
        destination.write_text(serialized, encoding="utf-8")
        print(f"Exported Unicode {unicodedata.unidata_version} to {destination}")


if __name__ == "__main__":
    main()
