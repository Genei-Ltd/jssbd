#!/usr/bin/env python3
"""Extract authored pySBD fixtures without executing Python package code."""

import argparse
import ast
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import subprocess


COMMIT = "5905f13be4fc95f407b98392e0ec303617a33d86"
ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Parameter:
    values: list
    expected_failure: bool


def literal(node, names):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, (ast.List, ast.Tuple)):
        return [literal(item, names) for item in node.elts]
    if isinstance(node, ast.Name):
        return names[node.id]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return literal(node.left, names) + literal(node.right, names)
    if isinstance(node, ast.Call) and ast.unparse(node.func) == "pytest.param":
        assert len(node.keywords) == 1
        mark = node.keywords[0]
        assert mark.arg == "marks" and ast.unparse(mark.value) == "pytest.mark.xfail"
        return Parameter([literal(arg, names) for arg in node.args], True)
    if isinstance(node, ast.Call) and ast.unparse(node.func) == "TextSpan":
        if node.args:
            return dict(zip(("sent", "start", "end"), [literal(arg, names) for arg in node.args]))
        return {kw.arg: literal(kw.value, names) for kw in node.keywords}
    raise ValueError(f"Unsupported fixture expression: {ast.dump(node)}")


def assignments(nodes):
    result = {}
    for node in nodes:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    result[target.id] = literal(node.value, result)
    return result


def segmenter_options(function):
    for node in ast.walk(function):
        if isinstance(node, ast.Call) and ast.unparse(node.func) == "pysbd.Segmenter":
            return {kw.arg: literal(kw.value, {}) for kw in node.keywords}
    return None


def function_defaults(function):
    return {
        arg.arg: literal(default, {})
        for arg, default in zip(function.args.args[-len(function.args.defaults):], function.args.defaults)
    }


def utf16_offset(text, offset):
    return len(text[:offset].encode("utf-16-le", errors="surrogatepass")) // 2


def spans(text, expected):
    records = [item if isinstance(item, dict) else dict(zip(("sent", "start", "end"), item)) for item in expected]
    return [
        {
            "sent": item["sent"],
            "start": utf16_offset(text, item["start"]),
            "end": utf16_offset(text, item["end"]),
        }
        for item in records
    ]


def export(upstream):
    commit = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
    if commit != COMMIT:
        raise ValueError(f"Expected pySBD v0.3.4 commit {COMMIT}; received {commit}")
    subprocess.run(["git", "-C", str(upstream), "diff", "--quiet", "HEAD", "--", "tests", "pysbd/languages.py"], check=True)
    test_root = upstream / "tests"
    fixture_tree = ast.parse((test_root / "conftest.py").read_text())
    fixtures = {
        node.name: segmenter_options(node)
        for node in fixture_tree.body
        if isinstance(node, ast.FunctionDef)
    }
    language_tree = ast.parse((upstream / "pysbd/languages.py").read_text())
    languages = next(
        [literal(key, {}) for key in node.value.keys]
        for node in language_tree.body
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "LANGUAGE_CODES" for t in node.targets)
    )
    result = {kind: [] for kind in ("sentences", "spans", "cleaner", "inputIntegrity", "invalidLanguages", "invalidOptions", "languageRegistry")}
    inventory = []
    source_hashes = {}
    for path in sorted(test_root.rglob("test_*.py")):
        source = path.relative_to(test_root).as_posix()
        source_hashes[source] = hashlib.sha256(path.read_bytes()).hexdigest()
        tree = ast.parse(path.read_text())
        names = assignments(tree.body)
        for function in tree.body:
            if not isinstance(function, ast.FunctionDef) or not function.name.startswith("test_"):
                continue
            decorators = [
                node for node in function.decorator_list
                if isinstance(node, ast.Call) and ast.unparse(node.func) == "pytest.mark.parametrize"
            ]
            assert len(decorators) <= 1
            parameters = literal(decorators[0].args[1], names) if decorators else [None]
            table = ast.unparse(decorators[0].args[1]) if decorators else None
            if decorators and not isinstance(decorators[0].args[1], ast.Name):
                table = "inline"
            excluded = "pdf" in function.name
            inventory.append({"source": source, "function": function.name, "line": function.lineno, "table": table, "cases": len(parameters), "excluded": excluded})
            if excluded:
                continue
            options = segmenter_options(function)
            if options is None:
                options = next((fixtures[arg.arg] for arg in function.args.args if arg.arg in fixtures), {"language": "en", "clean": False})
            language = options.get("language", "en")
            clean = options.get("clean", False)
            char_span = options.get("char_span", False)
            for index, parameter in enumerate(parameters):
                record = {
                    "id": f"{source}::{function.name}" + (f"/{table}[{index}]" if decorators else ""),
                    "expectedFailure": isinstance(parameter, Parameter) and parameter.expected_failure,
                }
                if decorators:
                    values = parameter.values if isinstance(parameter, Parameter) else parameter
                    args = dict(zip(literal(decorators[0].args[0], names).split(","), values))
                    text = args["text"]
                    expected = next(value for name, value in args.items() if name.startswith("expected"))
                    if source == "test_cleaner.py":
                        result["cleaner"].append({**record, "text": text, "expected": expected})
                    elif char_span:
                        result["spans"].append({**record, "language": language, "text": text, "expected": spans(text, expected)})
                    else:
                        result["sentences"].append({**record, "language": language, "clean": clean, "text": text, "expected": expected, "strip": True, "reconstruct": source == "regression/test_issues.py"})
                    continue
                defaults = function_defaults(function)
                name = function.name
                if name in ("test_no_input", "test_none_input", "test_newline_input"):
                    result["sentences"].append({**record, "language": language, "clean": clean, "text": defaults["text"], "expected": [], "strip": False, "reconstruct": False})
                elif name in ("test_cleaner_no_input", "test_cleaner_none_input"):
                    result["cleaner"].append({**record, "text": defaults["text"], "expected": defaults["text"]})
                elif name in ("test_cleaner_doesnt_mutate_input", "test_segmenter_doesnt_mutate_input"):
                    result["inputIntegrity"].append({**record, "cleaner": source == "test_cleaner.py", "text": defaults["text"]})
                elif name == "test_same_sentence_different_char_span":
                    expected_assignments = assignments([node for node in function.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ("text", "expected_text_spans")])
                    text = expected_assignments["text"]
                    result["spans"].append({**record, "language": language, "text": text, "expected": spans(text, expected_assignments["expected_text_spans"])})
                elif name == "test_exception_with_both_clean_and_span_true":
                    result["invalidOptions"].append({**record, "clean": True, "charSpan": True})
                elif name in ("test_exception_on_no_lang_code_provided", "test_exception_on_unsupported_lang_code_provided"):
                    value = next(literal(node.args[0], {}) for node in ast.walk(function) if isinstance(node, ast.Call) and ast.unparse(node.func) == "Language.get_language_code")
                    result["invalidLanguages"].append({**record, "language": value, "message": "Provide valid language ID i.e. ISO code."})
                elif name == "test_lang_code2instance_mapping":
                    result["languageRegistry"].append({**record, "languages": languages})
                else:
                    raise ValueError(f"Unhandled upstream test {source}:{function.lineno}: {name}")
    counts = {kind: len(cases) for kind, cases in result.items()}
    assert sum(counts.values()) == 484, counts
    assert sum(row["cases"] for row in inventory if row["excluded"]) == 13
    expected_failures = [case["id"] for cases in result.values() for case in cases if case["expectedFailure"]]
    assert len(expected_failures) == 3
    authored_names = Counter((row["source"], row["function"]) for row in inventory)
    duplicate_names = [{"source": source, "function": function} for (source, function), count in authored_names.items() if count > 1]
    return {
        "metadata": {
            "upstream": "https://github.com/nipunsadvilkar/pySBD",
            "version": "0.3.4",
            "commit": COMMIT,
            "authoredCases": 497,
            "includedCases": 484,
            "excludedPdfCases": 13,
            "counts": counts,
            "expectedFailures": expected_failures,
            "duplicateFunctionNames": duplicate_names,
            "inventory": inventory,
            "sourceSha256": source_hashes,
        },
        **result,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("upstream", nargs="?", type=Path, default=ROOT / ".context/upstream")
    parser.add_argument("--output", type=Path, default=ROOT / "tests/fixtures/upstream.json")
    parser.add_argument("--check", action="store_true", help="Compare existing fixture contents without writing.")
    args = parser.parse_args()
    data = export(args.upstream.resolve())
    if args.check:
        if json.loads(args.output.read_text()) != data:
            raise ValueError("Upstream fixtures differ; regenerate and review the changes.")
        print("Verified 484 upstream cases, including 3 expected failures; excluded 13 PDF cases.")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"Exported 484 upstream cases to {args.output}")


if __name__ == "__main__":
    main()
