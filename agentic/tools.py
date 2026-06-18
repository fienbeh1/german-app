"""
Tool registry — each tool is a callable with a name, description, and parameter schema.
"""

import os
import sys
import json
import subprocess
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from typing import Any, Callable


class Tool:
    def __init__(self, name: str, description: str, fn: Callable, parameters: dict):
        self.name = name
        self.description = description
        self.fn = fn
        self.parameters = parameters  # JSON Schema for params

    def __call__(self, **kwargs) -> str:
        try:
            result = self.fn(**kwargs)
            if result is None:
                return ""
            return str(result)
        except Exception as e:
            return f"Error: {e}"


# ── Tool implementations ──────────────────────────────────────────────

def _bash(command: str, workdir: str | None = None) -> str:
    """Execute a bash command and return stdout+stderr."""
    cwd = workdir or os.getcwd()
    try:
        r = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            timeout=120, cwd=cwd
        )
        out = r.stdout or ""
        err = r.stderr or ""
        if r.returncode != 0:
            return f"exit code {r.returncode}\nstdout:\n{out}\nstderr:\n{err}"
        if err:
            return out + "\n(stderr)\n" + err
        return out
    except subprocess.TimeoutExpired:
        return "Error: command timed out (120s)"
    except Exception as e:
        return f"Error: {e}"


def _read(path: str, offset: int = 0, limit: int = 2000) -> str:
    """Read file contents."""
    p = Path(path)
    if not p.exists():
        return f"Error: file not found: {path}"
    lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
    selected = lines[offset:offset + limit] if limit else lines
    return "\n".join(
        f"{i + 1}: {l}" for i, l in enumerate(selected, start=offset + 1)
    )


def _write(path: str, content: str) -> str:
    """Write content to a file (overwrites)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return f"Written {len(content)} bytes to {path}"


def _glob(pattern: str, path: str | None = None) -> str:
    """Find files matching a glob pattern."""
    root = Path(path or os.getcwd())
    matches = sorted(root.rglob(pattern))
    if not matches:
        return "No matches."
    return "\n".join(str(m.relative_to(root)) for m in matches)


def _grep(pattern: str, path: str | None = None, include: str | None = None) -> str:
    """Search file contents with regex."""
    root = Path(path or os.getcwd())
    import re as _re
    results = []
    for f in root.rglob("*"):
        if include and not f.match(include):
            continue
        if f.is_file() and f.suffix not in {".png", ".jpg", ".mp3", ".mp4",
                                              ".parquet", ".pkl", ".zip", ".rar"}:
            try:
                for i, line in enumerate(f.read_text("utf-8", errors="replace").splitlines(), 1):
                    if _re.search(pattern, line):
                        rel = f.relative_to(root)
                        results.append(f"{rel}:{i}: {line[:200]}")
            except Exception:
                pass
    if not results:
        return "No matches."
    return "\n".join(results[:200])


def _web_fetch(url: str) -> str:
    """Fetch a URL and return plain text content."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "agentic/0.1"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8", errors="replace")
            return content[:10000]
    except Exception as e:
        return f"Error fetching {url}: {e}"


def _ls(path: str | None = None) -> str:
    """List directory contents."""
    p = Path(path or os.getcwd())
    if not p.is_dir():
        return f"Error: not a directory: {path}"
    lines = []
    for entry in sorted(p.iterdir()):
        suffix = "/" if entry.is_dir() else ""
        lines.append(f"{entry.name}{suffix}")
    return "\n".join(lines) if lines else "(empty)"


# ── Registry ──────────────────────────────────────────────────────────

DEFAULT_TOOLS = [
    Tool(
        "bash",
        "Execute arbitrary bash commands. Returns stdout and stderr.",
        _bash,
        {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "bash command to run"},
                "workdir": {"type": "string", "description": "working directory (optional)"},
            },
            "required": ["command"],
        },
    ),
    Tool(
        "read",
        "Read a file from disk. Returns lines with line numbers.",
        _read,
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "absolute file path"},
                "offset": {"type": "integer", "description": "starting line (0-indexed)"},
                "limit": {"type": "integer", "description": "max lines to read"},
            },
            "required": ["path"],
        },
    ),
    Tool(
        "write",
        "Write content to a file. Overwrites existing content.",
        _write,
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "absolute file path"},
                "content": {"type": "string", "description": "file content"},
            },
            "required": ["path", "content"],
        },
    ),
    Tool(
        "glob",
        "Find files by glob pattern (e.g. '**/*.tsx').",
        _glob,
        {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "glob pattern"},
                "path": {"type": "string", "description": "root directory"},
            },
            "required": ["pattern"],
        },
    ),
    Tool(
        "grep",
        "Search file contents with a regex pattern.",
        _grep,
        {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "regex pattern"},
                "path": {"type": "string", "description": "root directory"},
                "include": {"type": "string", "description": "file pattern filter"},
            },
            "required": ["pattern"],
        },
    ),
    Tool(
        "web_fetch",
        "Fetch a URL and return its content as text.",
        _web_fetch,
        {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
            },
            "required": ["url"],
        },
    ),
    Tool(
        "ls",
        "List files and directories in a directory.",
        _ls,
        {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "directory path"},
            },
        },
    ),
]


class ToolRegistry:
    def __init__(self, tools: list[Tool] | None = None):
        self._tools: dict[str, Tool] = {}
        for t in (tools or DEFAULT_TOOLS):
            self._tools[t.name] = t

    def register(self, tool: Tool):
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list(self) -> list[str]:
        return list(self._tools.keys())

    def descriptions(self) -> str:
        parts = []
        for t in self._tools.values():
            params = json.dumps(t.parameters, indent=2)
            parts.append(f"  {t.name}: {t.description}\n    params: {params}")
        return "\n\n".join(parts)

    def call(self, name: str, **kwargs) -> str:
        tool = self.get(name)
        if not tool:
            return f"Error: unknown tool '{name}'. Available: {', '.join(self.list())}"
        return tool(**kwargs)

    def to_openai_tools(self) -> list[dict]:
        result = []
        for t in self._tools.values():
            result.append({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            })
        return result
