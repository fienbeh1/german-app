"""
Agent — uses Ollama's native tool calling API.
Falls back to JSON-in-text parsing for models that don't support it.
"""

import json
import os
import re
import textwrap

from .config import Config
from .model import OllamaModel
from .tools import ToolRegistry


def _build_system_prompt(workspace: str) -> str:
    return textwrap.dedent(f"""\
You are an autonomous software engineering agent.

Working directory: {workspace}

Call tools to accomplish your goal. Each turn you can call ONE tool.
Tool results come back immediately. Decide next step from the result.
When done, summarize what was accomplished.

Rules:
- Use `ls` to see directory contents, `glob` to find files by pattern.
- If a tool returns nothing useful, try a different approach.
- Do NOT repeat a call that already returned nothing.
- All paths are relative to: {workspace}
- Do not commit or push unless the goal requires it.
""")

TOOL_LIST_TEMPLATE = """Available tools:
{tool_descriptions}
"""


def _extract_json_tool_call(text: str) -> tuple[str, dict] | None:
    """Parse JSON tool call from text content (fallback for non-native models)."""
    # Try {"name": "...", "arguments": {...}} or {"tool": "...", "params": {...}}
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    candidate = text[start:end + 1]
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None

    name = parsed.get("name") or parsed.get("tool") or parsed.get("function", {}).get("name")
    args = parsed.get("arguments") or parsed.get("params") or parsed.get("function", {}).get("arguments") or {}
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            args = {}
    if name and isinstance(name, str):
        return name, args
    return None


class Agent:
    def __init__(self, config: Config | None = None):
        self.config = config or Config()
        self.model = OllamaModel(self.config)
        self.tools = ToolRegistry()
        self._turn = 0
        self._done = False
        self._stale_streak = 0
        self._last_calls: list[tuple[str, str]] = []
        self.history: list[dict] = []

    def run(self, goal: str, context: str = ""):
        ws = self.config.workspace
        openai_tools = self.tools.to_openai_tools()

        self.history = [
            {"role": "system", "content": _build_system_prompt(ws)},
            {"role": "system", "content": TOOL_LIST_TEMPLATE.format(
                tool_descriptions=self.tools.descriptions()
            )},
            {"role": "user", "content": f"Goal: {goal}" + (
                f"\n\nContext:\n{context}" if context else ""
            )},
        ]
        print(f"Goal: {goal}", flush=True)

        while self._turn < self.config.max_turns and not self._done:
            self._turn += 1
            print(f"\n─── Turn {self._turn} ───", flush=True)

            result = self.model.chat(self.history[-30:], tools=openai_tools)
            tool_calls = list(result.tool_calls or [])

            # Fallback: parse JSON tool call from text content
            if not tool_calls and result.content:
                parsed = _extract_json_tool_call(result.content)
                if parsed:
                    name, args = parsed
                    tool_calls.append({
                        "id": f"fallback_{name}",
                        "type": "function",
                        "function": {"name": name, "arguments": args},
                    })

            if tool_calls:
                for tc in tool_calls:
                    fn = tc["function"]
                    name = fn["name"]
                    params = fn["arguments"]

                    sig = (name, json.dumps(params, sort_keys=True))
                    self._last_calls.append(sig)
                    if len(self._last_calls) >= 3 and len(set(self._last_calls[-3:])) == 1:
                        print(f"  ✗ Repeated {name} 3×, aborting.", flush=True)
                        return f"Aborted — repeated {name} with same params."

                    print(f"  → {name}({json.dumps(params, ensure_ascii=False)[:200]})", flush=True)
                    tool_result = self.tools.call(name, **params)

                    if not tool_result.strip() or tool_result.strip() in ("No matches.", "(empty)"):
                        self._stale_streak += 1
                    else:
                        self._stale_streak = 0

                    truncated = tool_result[:3000] + ("\n…" if len(tool_result) > 3000 else "")
                    print(f"  ← {truncated[:300]}", flush=True)

                    self.history.append({
                        "role": "assistant",
                        "content": result.content or "",
                        "tool_calls": [tc] if tc.get("id", "").startswith("call_") else None,
                    })
                    self.history.append({
                        "role": "tool",
                        "content": tool_result[:10000],
                        "name": name,
                        "tool_call_id": tc["id"],
                    })

                    if self._stale_streak >= 4:
                        print(f"  ✗ {self._stale_streak} empty results, aborting.", flush=True)
                        return f"Aborted — {self._stale_streak} consecutive empty results."
            elif result.content and result.content.strip():
                self._done = True
                summary = result.content[:500]
                print(f"\n✓ {summary}", flush=True)
                return summary
            else:
                self._stale_streak += 1
                if self._stale_streak >= 3:
                    print(f"  ✗ No tool call in {self._stale_streak} turns.", flush=True)
                    return f"Aborted after {self._turn} turns."
                self.history.append({"role": "assistant", "content": ""})
                self.history.append({"role": "user", "content": "Call a tool or give a final answer."})

        print(f"\nMax turns ({self.config.max_turns}) reached.", flush=True)
        return f"Ran {self._turn} turns, incomplete."
