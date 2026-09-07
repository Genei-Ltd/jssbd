#!/usr/bin/env python3
"""Compare compiled jssbd with pinned pySBD using deterministic text corpora."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import itertools
import json
from pathlib import Path
import random
import re
from re import _compiler, _parser
import select
import subprocess
import sys
import time
import unicodedata
import warnings


ROOT = Path(__file__).resolve().parents[1]
COMMIT = "5905f13be4fc95f407b98392e0ec303617a33d86"
GROUPS = ("regressions", "upstream", "abbreviations", "captures", "witnesses", "punctuation", "lists", "cleaning", "replacement", "unicode", "generated", "validation")
MODES = ((False, False), (True, False), (False, True))
WHITESPACE = (" ", "\n", "\r", "\t", "\u0085", "\u001c", "\u2028", "\ufeff")


def read_json(path):
    return json.loads(path.read_text())


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=True, indent=2) + "\n")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_oracle(upstream):
    if sys.version_info[:2] != (3, 13) or unicodedata.unidata_version != "15.1.0":
        raise RuntimeError("Run with Python 3.13 and Unicode database 15.1.0.")
    commit = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
    if commit != COMMIT:
        raise RuntimeError(f"Expected upstream commit {COMMIT}, received {commit}.")
    subprocess.run(["git", "-C", str(upstream), "diff", "--quiet", "HEAD", "--"], check=True)
    sys.path.insert(0, str(upstream))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", SyntaxWarning)
        import pysbd
        from pysbd.languages import LANGUAGE_CODES
    if Path(pysbd.__file__).resolve().parent != upstream / "pysbd":
        raise RuntimeError("The oracle did not load from the pinned checkout.")
    return pysbd, LANGUAGE_CODES, verify_data(LANGUAGE_CODES)


def verify_data(language_codes):
    from pysbd.clean.rules import CleanRules, HTML
    from pysbd.exclamation_words import ExclamationWords
    from pysbd.lists_item_replacer import ListItemReplacer
    from pysbd.utils import Rule

    data = read_json(ROOT / "src/data.json")
    cleaning = read_json(ROOT / "src/clean-data.json")
    checks = Counter()

    def rule(value):
        return {"source": value.pattern, "replacement": value.replacement}

    def rules(value):
        if hasattr(value, "All"):
            value = value.All
        return [rule(item) for item in (value if isinstance(value, list) else [value])]

    def compare(path, actual, expected, group):
        if actual != expected:
            raise RuntimeError(f"Source data differs from pinned pySBD at {path}.")
        checks[group] += 1

    compare("languages", set(data["languages"]), set(language_codes), "languageRegistry")
    rule_names = (
        "PossessiveAbbreviationRule", "KommanditgesellschaftRule", "GeoLocationRule",
        "FileFormatRule", "SingleNewLineRule", "QuestionMarkInQuotationRule", "SubSingleQuoteRule",
        "SingleLetterAbbreviationRules", "AmPmRules", "DoublePunctuationRules", "ExclamationPointRules",
        "SubSymbolsRules", "EllipsisRules", "ReinsertEllipsisRules", "WithMultiplePeriodsAndEmailRule",
    )
    regex_names = (
        "QUOTATION_AT_END_OF_SENTENCE_REGEX", "PARENS_BETWEEN_DOUBLE_QUOTES_REGEX",
        "SPLIT_SPACE_QUOTATION_AT_END_OF_SENTENCE_REGEX", "CONTINUOUS_PUNCTUATION_REGEX",
        "NUMBERED_REFERENCE_REGEX",
    )
    compare("rules.keys", set(data["rules"]), set(rule_names), "dataShape")
    compare("regex.keys", set(data["regex"]), set(regex_names), "dataShape")
    for language, cls in language_codes.items():
        replacer = getattr(cls, "AbbreviationReplacer", cls)
        starters = getattr(replacer, "SENTENCE_STARTERS", None)
        if starters is None:
            starters = cls.SENTENCE_STARTERS
        expected = {
            "abbreviations": cls.Abbreviation.ABBREVIATIONS,
            "prepositive": cls.Abbreviation.PREPOSITIVE_ABBREVIATIONS,
            "numberAbbreviations": cls.Abbreviation.NUMBER_ABBREVIATIONS,
            "punctuation": cls.Punctuations,
            "boundary": cls.SENTENCE_BOUNDARY_REGEX,
            "multiPeriod": cls.MULTI_PERIOD_ABBREVIATION_REGEX,
            "numberRules": rules(cls.Numbers),
            "sentenceStarters": starters,
        }
        actual = {**data["common"], **data["languages"][language]}
        compare(f"languages.{language}.keys", set(actual), set(expected), "dataShape")
        for name, value in expected.items():
            compare(f"languages.{language}.{name}", actual[name], value, "languageFields")
        for name in rule_names:
            owner = cls.Abbreviation if name == "WithMultiplePeriodsAndEmailRule" else cls
            compare(f"rules.{name}/{language}", data["rules"][name], rules(getattr(owner, name)), "sharedRuleFields")
        for name in regex_names:
            compare(f"regex.{name}/{language}", data["regex"][name], getattr(cls, name), "sharedRegexFields")
    expected_list_regex = {
        name: value for name, value in vars(ListItemReplacer).items()
        if name.isupper() and isinstance(value, str)
    }
    compare("listRegex.keys", set(data["listRegex"]), set(expected_list_regex), "dataShape")
    for name, value in expected_list_regex.items():
        compare(f"listRegex.{name}", data["listRegex"][name], value, "listRegexFields")
    expected_list_rules = {
        name: rules(value) for name, value in vars(ListItemReplacer).items()
        if name.startswith("SpaceBetweenListItems")
    }
    compare("listRules.keys", set(data["listRules"]), set(expected_list_rules), "dataShape")
    for name, value in expected_list_rules.items():
        compare(f"listRules.{name}", data["listRules"][name], value, "listRuleFields")
    compare("romanNumerals", data["romanNumerals"], ListItemReplacer.ROMAN_NUMERALS, "tables")
    compare("exclamationWords", data["exclamationWords"], ExclamationWords.EXCLAMATION_WORDS, "tables")
    expected_cleaning = {
        name: rule(value) if isinstance(value, Rule) else value
        for name, value in vars(CleanRules).items()
        if not name.startswith("_") and name != "NewLineFollowedByBulletRule"
    }
    expected_cleaning["html"] = rules(HTML)
    compare("clean-data.keys", set(cleaning), set(expected_cleaning), "dataShape")
    for name, value in expected_cleaning.items():
        compare(f"clean-data.{name}", cleaning[name], value, "cleanerFields")
    return {"checks": dict(checks), "dataSha256": sha256(ROOT / "src/data.json"), "cleanDataSha256": sha256(ROOT / "src/clean-data.json")}


def oracle_result(pysbd, case):
    try:
        result = pysbd.Segmenter(
            language=case["language"], clean=case["clean"], char_span=case["charSpan"]
        ).segment(case["text"])
        if case["charSpan"]:
            text = case["text"] or ""
            def offset(index):
                return len(text[:index].encode("utf-16-le", errors="surrogatepass")) // 2
            result = [{"sent": span.sent, "start": offset(span.start), "end": offset(span.end)} for span in result]
        return {"value": result}
    except Exception as error:
        if isinstance(error, re.error):
            name = "SyntaxError"
        elif isinstance(error, (ValueError, IndexError, OverflowError)):
            name = "RangeError"
        elif isinstance(error, TypeError):
            name = "TypeError"
        else:
            name = type(error).__name__
        return {"error": name, "pythonError": type(error).__name__, "message": str(error)}


def same_result(expected, actual):
    if "error" in expected or "error" in actual:
        return expected.get("error") == actual.get("error")
    return expected == actual


def failure_kind(expected, actual):
    return (expected.get("error", "value"), actual.get("error", "value"))


class Worker:
    def __init__(self, module, timeout):
        self.timeout = timeout
        self.process = subprocess.Popen(
            ["node", str(ROOT / "scripts/parity-worker.mjs"), str(module)],
            cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, encoding="utf-8", bufsize=1,
        )

    def call(self, cases):
        self.process.stdin.write(json.dumps(cases, ensure_ascii=True) + "\n")
        self.process.stdin.flush()
        readable, _, _ = select.select([self.process.stdout], [], [], self.timeout)
        if not readable:
            raise TimeoutError(f"JavaScript worker exceeded {self.timeout} seconds; replay a smaller batch.")
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(f"JavaScript worker exited with status {self.process.poll()}.")
        result = json.loads(line)
        if len(result) != len(cases):
            raise RuntimeError("JavaScript worker returned a different number of results.")
        return result

    def close(self):
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


def modes(text, language, group, source):
    for clean, char_span in MODES:
        yield {
            "id": f"{group}/{source}/{language}/{'clean' if clean else 'spans' if char_span else 'ordinary'}",
            "group": group, "text": text, "language": language,
            "clean": clean, "charSpan": char_span,
        }


def abbreviation_witnesses(language_codes, limit):
    operators = Counter()
    patterns = []

    def children(op, value):
        if op == "SUBPATTERN":
            return [value[3]]
        if op == "BRANCH":
            return value[1]
        if op in ("MAX_REPEAT", "MIN_REPEAT", "POSSESSIVE_REPEAT"):
            return [value[2]]
        return []

    def inspect(nodes):
        found = set()
        for operation, value in nodes:
            name = str(operation)
            found.add(name)
            for nested in children(name, value):
                found.update(inspect(nested))
        return found

    def bounded(values):
        return list(itertools.islice(dict.fromkeys(values), limit))

    def combine(left, right):
        return bounded(a + b for a, b in itertools.product(left, right))

    def generate(nodes, state, flags):
        result = [""]
        for operation, value in nodes:
            name = str(operation)
            if name == "LITERAL":
                values = [chr(value)]
            elif name == "ANY":
                values = [".", "x", "(", ")", "|", "\\", "😀"]
            elif name == "SUBPATTERN":
                _, add_flags, remove_flags, body = value
                values = generate(body, state, (flags | add_flags) & ~remove_flags)
            elif name == "BRANCH":
                values = bounded(word for branch in value[1] for word in generate(branch, state, flags))
            elif name in ("MAX_REPEAT", "MIN_REPEAT", "POSSESSIVE_REPEAT"):
                minimum, maximum, body = value
                if minimum > 8:
                    raise RuntimeError("Abbreviation witness repetition exceeds its explicit bound of eight.")
                words = generate(body, state, flags)
                values = []
                for count in dict.fromkeys((minimum, min(maximum, minimum + 1), min(maximum, minimum + 2))):
                    repeated = [""]
                    for _ in range(count):
                        repeated = combine(repeated, words)
                    values.extend(repeated)
                values = bounded(values)
            elif name in ("IN", "NOT_LITERAL", "CATEGORY"):
                candidates = list("aAzZ019_ .-\n") + ["é", "١", "😀", "\u0085"]
                if name == "IN":
                    for kind, term in value:
                        if str(kind) == "LITERAL":
                            candidates.append(chr(term))
                        elif str(kind) == "RANGE":
                            candidates.extend((chr(term[0]), chr(term[1])))
                atom = _compiler.compile(_parser.SubPattern(state, [(operation, value)]), flags)
                values = bounded(candidate for candidate in candidates if atom.fullmatch(candidate))
            else:
                raise RuntimeError(f"Unsupported abbreviation grammar operator {name}; extend the witness generator.")
            if not values:
                raise RuntimeError(f"No bounded abbreviation witness for {name}.")
            result = combine(result, values)
        return result

    for language, cls in language_codes.items():
        for abbreviation in sorted(set(cls.Abbreviation.ABBREVIATIONS)):
            source = abbreviation.strip()
            parsed = _parser.parse(source, re.IGNORECASE)
            found = inspect(parsed)
            operators.update(found)
            if found <= {"LITERAL", "ANY"}:
                continue
            compiled = re.compile(source, re.IGNORECASE)
            witnesses = []
            for text in generate(parsed, parsed.state, re.IGNORECASE):
                match = compiled.fullmatch(text)
                if match is None:
                    raise RuntimeError(f"Generated witness does not match {language} abbreviation {source!r}.")
                witnesses.append({"text": text, "groups": list(match.groups())})
            patterns.append({"language": language, "source": source, "operators": sorted(found), "witnesses": witnesses})
    return {"operatorsByPattern": dict(operators), "limitPerPattern": limit, "patterns": patterns}


def corpus(args, language_codes, witness_plan):
    languages = args.language or list(language_codes)
    for language in languages:
        if language not in language_codes:
            raise ValueError(f"Unknown corpus language {language!r}.")
    groups = set(args.group or GROUPS)
    if "regressions" in groups:
        seeds = [
            ("en", "{etc} A etc. lower. Next."),
            ("en", "{etc} É etc. lower. Next."),
            ("en", "{etc} Ⅰ etc. lower. Next."),
            ("it", "a.c. Smith. axc. Smith."),
            ("es", "ph.d. Smith. phxd. Smith."),
            ("de", "d.h. Smith. d]h. Smith."),
            ("ru", "у.е. Smith. у{е. Smith."),
            ("ar", "ا.د. Smith. ا}د. Smith."),
            ("de", "d.h. d*h."),
            ("ru", "у.е. у+е."),
            ("ar", "ا.د. ا?د."),
            ("de", "d.h. d|h."),
            ("de", "d.h. d]h."),
            ("de", "d|h. d.h."),
            ("de", "b.a b\\a"),
            ("es", "{etc} \u1c89 etc. l"),
            ("en", "<\u1c89>Hi.</\u1c89> Next."),
            ("en", "\U00010d41. First item 2. Second item."),
            ("nl", "ed(s) eds. word."),
            ("it", "ten.(lt) ten.lt. word."),
            ("en", "<b>"),
        ]
        for index, (language, text) in enumerate(seeds):
            if language in languages:
                yield from modes(text, language, "regressions", str(index))
    if "upstream" in groups:
        fixtures = read_json(ROOT / "tests/fixtures/upstream.json")
        assert fixtures["metadata"]["commit"] == COMMIT
        for fixture in fixtures["sentences"] + fixtures["spans"]:
            if fixture["language"] in languages:
                for case in modes(fixture["text"], fixture["language"], "upstream", fixture["id"]):
                    case["upstreamExpectedFailure"] = fixture["expectedFailure"]
                    yield case
    if "abbreviations" in groups:
        for language in languages:
            abbreviations = sorted(set(language_codes[language].Abbreviation.ABBREVIATIONS))
            for index, abbreviation in enumerate(abbreviations):
                for suffix_index, suffix in enumerate((" Smith. Next.", " lower. Next.", " 12. Next.")):
                    yield from modes(abbreviation.strip() + "." + suffix, language, "abbreviations", f"{index}-{suffix_index}")
    if "captures" in groups:
        prefixes = ("(", ")", "[", "]", "{", "}", "\\", "\\1", "\\g<1>", "a|b", "(a)", "(?:a)", "(?P<x>a)", "(a)?", "[a-z]", "a{2,3}", "$&", "$1", "a+b", "a*b", "a?b", "^", "$", ".", "K", "İ")
        for language in languages:
            abbreviations = sorted(set(language_codes[language].Abbreviation.ABBREVIATIONS))
            samples = list(dict.fromkeys(["dr", "mr", "co"] + abbreviations[:3]))
            for index, (prefix, abbreviation, suffix) in enumerate(itertools.product(prefixes, samples, (" Smith. Next.", " lower. Next."))):
                yield from modes(prefix + " " + abbreviation.strip() + "." + suffix, language, "captures", str(index))
            dotted = [abbreviation.strip() for abbreviation in abbreviations if "." in abbreviation]
            replacements = ("x", "*", "+", "?", "|", "]", "[", "{", "}", "(", ")", "\\", "^", "$", "😀")
            templates = (
                "{abbreviation}. Smith. {word}. Smith.",
                "{word}. Smith. {abbreviation}. Smith.",
                "{word}. {abbreviation}.",
                "{abbreviation}.{word}.Smith.",
            )
            for abbreviation_index, abbreviation in enumerate(dotted):
                dot_positions = [index for index, character in enumerate(abbreviation) if character == "."]
                variants = []
                for replacement in replacements:
                    variants.extend(abbreviation[:index] + replacement + abbreviation[index + 1:] for index in dot_positions)
                    variants.append(abbreviation.replace(".", replacement))
                if len(dot_positions) >= 2:
                    for opening, closing in (("(", ")"), ("[", "]"), ("{", "}"), ("|", "|")):
                        letters = list(abbreviation)
                        letters[dot_positions[0]] = opening
                        letters[dot_positions[1]] = closing
                        variants.append("".join(letters))
                for variant_index, word in enumerate(dict.fromkeys(variants)):
                    for template_index, template in enumerate(templates):
                        text = template.format(abbreviation=abbreviation, word=word)
                        yield from modes(text, language, "captures", f"mutation-{abbreviation_index}-{variant_index}-{template_index}")
    if "witnesses" in groups:
        templates = (
            "{source} {witness}. word. Next.",
            "{witness}. word. Next. {source}",
            "{source}\n{witness}. word. Next.",
            "{source}  {witness}. Smith. Next.",
        )
        for pattern_index, item in enumerate(witness_plan["patterns"]):
            if item["language"] not in languages:
                continue
            for witness_index, witness in enumerate(item["witnesses"]):
                for template_index, template in enumerate(templates):
                    text = template.format(source=item["source"], witness=witness["text"])
                    for case in modes(text, item["language"], "witnesses", f"{pattern_index}-{witness_index}-{template_index}"):
                        yield {**case, "abbreviationPattern": item["source"], "matchedWitness": witness["text"], "matchedGroups": witness["groups"]}
    if "punctuation" in groups:
        punctuation = (".", "!", "?", "?!", "....", "。", "։", "؟")
        wrappers = (("", ""), ('"', '"'), ("“", "”"), ("(", ")"), ("「", "」"))
        for language in languages:
            for index, (ending, wrapper, space) in enumerate(itertools.product(punctuation, wrappers, (" ", "\n", "\u2028", "\u001c"))):
                text = wrapper[0] + "First" + ending + space + "Next." + wrapper[1] + space + "End."
                yield from modes(text, language, "punctuation", str(index))
    if "lists" in groups:
        markers = (("1.", "2.", "3."), ("1)", "2)", "3)"), ("a.", "b.", "c."), ("a)", "b)", "c)"), ("i)", "ii)", "iii)"), ("(i)", "(ii)", "(iii)"))
        for language in languages:
            for index, (items, separator, ending) in enumerate(itertools.product(markers, (" ", "\n", "\t", "\u001c"), ("", ".", "!"))):
                text = separator.join(marker + " " + word + ending for marker, word in zip(items, ("One", "Two", "Three")))
                yield from modes(text, language, "lists", str(index))
    if "cleaning" in groups:
        fragments = ("<b>", "<b></b>", "<p>First.</p>", "<em>First.</em><em>Next.</em>", "<bpt i=\"0\">&lt;b&gt;</bpt>First.<ept>&lt;/b&gt;</ept>", "First\\nNext.", "First\\ r \\ nNext.", "First`Next.", "First{b^&gt;1&lt;b^}Next.", "////", "..........", "[First? Next.]", "の\n文", "W\nA\nRN\nI\nNG")
        for language in languages:
            for index, (fragment, suffix) in enumerate(itertools.product(fragments, ("", " Next.", "\nNext.", "\r\nNext.", "\u0085Next.", "\ufeffNext."))):
                yield from modes(fragment + suffix, language, "cleaning", str(index))
    if "replacement" in groups:
        suffixes = (
            r"\g<0>", r"\g<00>", r"\g<01>", r"\g<1>", r"\g<name>", r"\g<!>",
            "\\g<é>", "\\g<\u1c89>", "\\g<\u0301>", "\\g<e\u0301>",
            "\\g<a\u0301>", "\\g<α\u0301>", "\\g<a\u0301_1>",
            "\\g<٠>", "\\g<١>", "\\g<０>", "\\g<²>",
            r"\g<+0>", r"\g<-0>", r"\g< 0>", r"\g<>", r"\g<", r"\g",
            r"\g<4294967295>", "\\g<" + "9" * 500 + ">",
            r"\1", r"\10", r"\11", r"\0", r"\00", r"\000", r"\077", r"\123",
            r"\377", r"\400", r"\777", r"\08", r"\099", r"\999",
            r"\a", r"\b", r"\f", r"\n", r"\r", r"\t", r"\v",
            r"\N{LATIN CAPITAL LETTER A}", r"\u1234", r"\U0001f600", r"\x41",
            r"\p", r"\c", r"\&", r"\[", "\\ ", "\\é", "\\\n", "\\", "\\\\",
        )
        templates = ("Hi.There{}", "a.1{}", "1.There{}", "{}Hi.There")
        for language in languages:
            for index, (suffix, template) in enumerate(itertools.product(suffixes, templates)):
                yield from modes(template.format(suffix), language, "replacement", str(index))
    if "unicode" in groups:
        words = ("😀", "𐐀", "𐐨", "𝟙", "İ", "ı", "ſ", "K", "e\u0301", "é", "👨‍👩‍👧‍👦", "中", "العربية", "русский", "हिन्दी", "ΟΣ", "ΟΣΑ", "\U0002ebf0", "\u1c89", "\u1c8a", "\ud800", "\udfff")
        for language in languages:
            for index, (word, space) in enumerate(itertools.product(words, WHITESPACE)):
                yield from modes(word + "." + space + word + "." + space + "End.", language, "unicode", str(index))
            for index, character in enumerate(words):
                for abbreviation in ("etc", "co", "a.m"):
                    yield from modes("{" + abbreviation + "} " + character + " " + abbreviation + ". lower. Next.", language, "unicode", f"guard-{abbreviation}-{index}")
    if "generated" in groups:
        randomizer = random.Random(args.seed)
        tokens = ("Hi", "Next", "End", "lower", "Dr.", "Mr.", "etc.", "U.S.", "a.m.", "1.", "2.", "a.", "b.", "i)", "ii)", ".", "..", "...", "....", "!", "?", "。", "؟", "،", "։", *WHITESPACE, "😀", "İ", "ı", "ſ", "K", "é", "e\u0301", "中", "の", '"', "'", "“", "”", "(", ")", "[", "]", "{", "}", "\\", "$&", "<b>", "</b>", "∯", "ȸ", "&ᓴ&", "&ᓷ&")
        for index in range(args.generated):
            text = "".join(randomizer.choice(tokens) + randomizer.choice(("", " ", " ")) for _ in range(randomizer.randrange(2, 15)))
            yield from modes(text, randomizer.choice(languages), "generated", str(index))
    if "validation" in groups:
        for language in ("", "EN", "elvish", None):
            yield {"id": f"validation/language/{language}", "group": "validation", "text": "First.", "language": language, "clean": False, "charSpan": False}
        for language in languages:
            yield {"id": f"validation/options/{language}", "group": "validation", "text": "First.", "language": language, "clean": True, "charSpan": True}


def replay(path):
    if path.is_dir():
        path = path / "mismatches.jsonl"
    if path.suffix == ".jsonl":
        with path.open() as handle:
            values = [json.loads(line) for line in handle if line.strip()]
    else:
        values = read_json(path)
    for index, value in enumerate(values):
        case = value.get("case", value)
        yield {**case, "id": case.get("id", f"replay/{index}"), "group": case.get("group", "replay")}


def minimize(mismatch, pysbd, worker, max_steps):
    original = mismatch["case"]
    if not isinstance(original["text"], str):
        return {**mismatch, "shrinkSteps": 0}
    text = original["text"]
    signature = failure_kind(mismatch["python"], mismatch["javascript"])
    cache = {}
    steps = 0

    def retains_failure(candidate):
        nonlocal steps
        if candidate in cache:
            return cache[candidate]
        if steps >= max_steps:
            return False
        steps += 1
        case = {**original, "text": candidate}
        expected = oracle_result(pysbd, case)
        actual = worker.call([case])[0]
        retains = not same_result(expected, actual) and failure_kind(expected, actual) == signature
        cache[candidate] = retains
        return retains

    chunks = 2
    while len(text) > 0 and steps < max_steps:
        size = max(1, (len(text) + chunks - 1) // chunks)
        reduced = False
        for start in range(0, len(text), size):
            candidate = text[:start] + text[start + size:]
            if retains_failure(candidate):
                text = candidate
                chunks = max(2, chunks - 1)
                reduced = True
                break
        if not reduced:
            if chunks >= len(text):
                break
            chunks = min(len(text), chunks * 2)
    case = {**original, "text": text}
    return {"case": case, "python": oracle_result(pysbd, case), "javascript": worker.call([case])[0], "originalId": original["id"], "originalLength": len(original["text"]), "shrinkSteps": steps, "shrinkLimitReached": steps >= max_steps}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--upstream", type=Path, default=ROOT / ".context/upstream")
    parser.add_argument("--module", type=Path, default=ROOT / "dist/index.mjs")
    parser.add_argument("--seed", type=int, default=20260907)
    parser.add_argument("--generated", type=int, default=2000)
    parser.add_argument("--group", action="append", choices=GROUPS)
    parser.add_argument("--language", action="append")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--witness-limit", type=int, default=32)
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--replay", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--shrink", type=int, default=0, help="Minimize up to this many distinct mismatch kinds, preserving language and mode.")
    parser.add_argument("--shrink-steps", type=int, default=200)
    args = parser.parse_args()
    if min(args.generated, args.shrink, args.shrink_steps) < 0 or min(args.batch_size, args.witness_limit) < 1 or args.timeout <= 0:
        parser.error("Counts must be nonnegative; batch size, witness limit, and timeout must be positive.")
    upstream = args.upstream.resolve()
    module = args.module.resolve()
    pysbd, language_codes, data_verification = load_oracle(upstream)
    witness_plan = abbreviation_witnesses(language_codes, args.witness_limit)
    if not module.is_file():
        parser.error("Compiled entry point not found. Run pnpm run build first.")
    output = args.output or ROOT / ".context/parity" / datetime.now(timezone.utc).strftime(f"%Y%m%dT%H%M%S.%fZ-seed{args.seed}")
    output.mkdir(parents=True, exist_ok=False)
    metadata = {
        "upstreamCommit": COMMIT, "python": sys.version, "unicode": unicodedata.unidata_version,
        "node": subprocess.check_output(["node", "--version"], text=True).strip(),
        "seed": args.seed, "generatedInputs": args.generated, "groups": args.group or list(GROUPS),
        "languages": args.language or list(language_codes), "module": str(module), "moduleSha256": sha256(module),
        "runnerSha256": sha256(Path(__file__)), "workerSha256": sha256(ROOT / "scripts/parity-worker.mjs"),
        "replay": str(args.replay.resolve()) if args.replay else None,
        "dataVerification": data_verification,
        "abbreviationGrammar": {**witness_plan, "patterns": [{**item, "witnesses": len(item["witnesses"])} for item in witness_plan["patterns"]]},
        "errorComparison": "ValueError/IndexError/OverflowError=>RangeError, re.error=>SyntaxError, TypeError=>TypeError; compare classes and retain both messages.",
    }
    write_json(output / "metadata.json", metadata)
    cases = iter(replay(args.replay) if args.replay else corpus(args, language_codes, witness_plan))
    worker = Worker(module, args.timeout)
    counts, mismatch_groups, error_pairs = Counter(), Counter(), Counter()
    mismatch_count = compared = xfail_cases = 0
    samples = []
    sample_kinds = set()
    started = last_progress = time.monotonic()
    try:
        with (output / "cases.jsonl").open("w") as inputs, (output / "mismatches.jsonl").open("w") as failures:
            while batch := list(itertools.islice(cases, args.batch_size)):
                for case in batch:
                    inputs.write(json.dumps(case, ensure_ascii=True) + "\n")
                actuals = worker.call(batch)
                for case, actual in zip(batch, actuals):
                    expected = oracle_result(pysbd, case)
                    compared += 1
                    counts[case["group"]] += 1
                    xfail_cases += bool(case.get("upstreamExpectedFailure"))
                    if "error" in expected or "error" in actual:
                        error_pairs[str(failure_kind(expected, actual))] += 1
                    if not same_result(expected, actual):
                        mismatch = {"case": case, "python": expected, "javascript": actual}
                        failures.write(json.dumps(mismatch, ensure_ascii=True) + "\n")
                        mismatch_count += 1
                        mismatch_groups[case["group"]] += 1
                        kind = (case["group"], case["language"], case["clean"], case["charSpan"], failure_kind(expected, actual))
                        if len(samples) < args.shrink and kind not in sample_kinds:
                            samples.append(mismatch)
                            sample_kinds.add(kind)
                if time.monotonic() - last_progress >= 5:
                    print(f"Compared {compared} cases; {mismatch_count} mismatches.", flush=True)
                    last_progress = time.monotonic()
        minimized = []
        for index, mismatch in enumerate(samples):
            minimized.append(minimize(mismatch, pysbd, worker, args.shrink_steps))
            print(f"Minimized mismatch {index + 1}/{len(samples)}.", flush=True)
        write_json(output / "minimized.json", minimized)
    finally:
        worker.close()
    summary = {"cases": compared, "groups": dict(counts), "upstreamExpectedFailureCasesCompared": xfail_cases, "mismatches": mismatch_count, "mismatchGroups": dict(mismatch_groups), "errorPairs": dict(error_pairs), "minimized": len(samples), "durationSeconds": round(time.monotonic() - started, 3), "output": str(output.resolve())}
    write_json(output / "summary.json", summary)
    print(json.dumps(summary, indent=2), flush=True)
    return 1 if mismatch_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
