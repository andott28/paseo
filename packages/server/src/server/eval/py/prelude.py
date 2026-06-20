"""Prelude — loaded into Python kernel namespace on startup."""

import json
import urllib.request
import urllib.error
import os
from typing import Any

_BRIDGE_URL = os.environ.get("EVAL_BRIDGE_URL", "")
_HMAC_SECRET = os.environ.get("EVAL_HMAC_SECRET", "")


def _bridge_post(endpoint: str, data: dict) -> Any:
    if not _BRIDGE_URL:
        raise RuntimeError("Bridge URL not configured")
    url = f"{_BRIDGE_URL.rstrip('/')}{endpoint}"
    body = json.dumps(data).encode()
    headers = {"Content-Type": "application/json"}
    if _HMAC_SECRET:
        headers["Authorization"] = f"Bearer {_HMAC_SECRET}"
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


class _ToolProxy:
    def read(self, path: str) -> str:
        result = _bridge_post("/read", {"path": path})
        return result.get("content", "")

    def write(self, path: str, content: str) -> None:
        _bridge_post("/write", {"path": path, "content": content})

    def grep(self, pattern: str, path: str) -> str:
        result = _bridge_post("/grep", {"pattern": pattern, "path": path})
        return json.dumps(result.get("results", []))

    def glob(self, pattern: str, root: str = ".") -> list:
        result = _bridge_post("/glob", {"pattern": pattern, "root": root})
        return result.get("files", [])


tool = _ToolProxy()


def display(data: Any) -> None:
    frame = json.dumps({"type": "display", "data": data})
    print(f"\0DISPLAY:{frame}\0", flush=True)


import collections
import datetime
import functools
import itertools
import math
import os
import pathlib
import re
import sys
import typing
