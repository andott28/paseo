#!/usr/bin/env python3
"""NDJSON runner for Python eval backend. Reads JSON requests from stdin, executes code, emits frames."""

import sys
import json
import traceback
import io
import contextlib
import os
import signal

_globals: dict = {"__builtins__": __builtins__}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        request_id = request.get("id", "?")
        code = request.get("code", "")
        timeout = request.get("timeout", 30)
        reset = request.get("reset", False)

        if reset:
            _globals.clear()
            _globals["__builtins__"] = __builtins__

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        error: str | None = None

        def _timeout_handler(_signum: int, _frame: object) -> None:
            raise TimeoutError(f"Execution timed out after {timeout}s")

        old_handler: object = None
        if timeout and timeout > 0 and hasattr(signal, "SIGALRM"):
            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(timeout)

        try:
            with (
                contextlib.redirect_stdout(stdout_capture),
                contextlib.redirect_stderr(stderr_capture),
            ):
                exec(code, _globals)
        except TimeoutError as e:
            error = str(e)
        except BaseException:
            error = traceback.format_exc()
        finally:
            if timeout and timeout > 0 and hasattr(signal, "SIGALRM"):
                signal.alarm(0)
                if old_handler is not None:
                    signal.signal(signal.SIGALRM, old_handler)

        stdout_text = stdout_capture.getvalue()
        stderr_text = stderr_capture.getvalue()

        if stdout_text:
            _emit("stdout", {"text": stdout_text}, request_id)
        if stderr_text:
            _emit("stderr", {"text": stderr_text}, request_id)
        if error:
            _emit("error", {"message": error}, request_id)
        else:
            _emit("result", {"data": None}, request_id)
        _emit("done", {}, request_id)


def _emit(type_: str, data: dict, request_id: str) -> None:
    frame = {"type": type_, "id": request_id}
    frame.update(data)
    sys.stdout.write(json.dumps(frame) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
