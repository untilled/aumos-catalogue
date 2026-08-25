#!/usr/bin/env python3
"""Runs the frozen Trading Harness numeric core so its output can be compared,
field by field, with the ported deterministic core in
`managers/evidence-gated-allocator/lib/`. (issue #50, Phase 1C)

This file is a bridge, not a copy. It imports the legacy modules from a checkout
the operator names on the command line and calls them; it holds no algorithm of
its own, so it cannot drift into agreeing with the port by restating it.

    python3 tools/legacy-parity.py <legacy-harness-root> < requests.json

stdin is a JSON array of {"module", "function", "args"}; stdout is a JSON array
of results in the same order, each `{"ok": true, "value": ...}` or
`{"ok": false, "error": "..."}`. Nothing else is written to stdout.

⛔ Only `bin/_common.py` and the pure `suggest()` in `bin/size-suggest` are
reachable, and neither opens a file, a credential or a socket when imported. The
legacy tree also holds `bin/*-credentials.json` and a `data/` ledger of the
investor's real positions; this bridge never names them, and the parity fixtures
are synthetic.
"""
import importlib.machinery
import importlib.util
import json
import sys
from pathlib import Path

ALLOWED = {'_common': '_common.py', 'size-suggest': 'size-suggest'}


def load(root: Path, name: str):
    # `bin/size-suggest` has no `.py` suffix, so the default finder returns a
    # spec with no loader. Naming the loader is what makes an extensionless
    # executable importable without copying it.
    path = root / 'bin' / ALLOWED[name]
    module_name = f'legacy_{name.replace("-", "_")}'
    spec = importlib.util.spec_from_loader(module_name, importlib.machinery.SourceFileLoader(module_name, str(path)))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if len(sys.argv) != 2:
        print('usage: legacy-parity.py <legacy-harness-root>', file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).expanduser().resolve()
    requests = json.load(sys.stdin)
    cache: dict[str, object] = {}
    results = []
    for request in requests:
        module_name = request.get('module')
        try:
            if module_name not in ALLOWED:
                raise KeyError(f'module {module_name!r} is not reachable from this bridge')
            if module_name not in cache:
                cache[module_name] = load(root, module_name)
            function = getattr(cache[module_name], request['function'])
            value = function(*request.get('args', []), **request.get('kwargs', {}))
            results.append({'ok': True, 'value': value})
        except Exception as error:  # noqa: BLE001 — the driver reports, it does not recover
            results.append({'ok': False, 'error': f'{type(error).__name__}: {error}'})
    json.dump(results, sys.stdout)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
