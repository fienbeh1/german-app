"""
LLM interface using Ollama's native tool calling API.
No JSON-from-text parsing — the API returns structured tool_calls.
"""

import json
import urllib.request
import urllib.error

TOOL_CALL_FINISH_REASON = "tool_calls"
STOP_FINISH_REASON = "stop"


class ChatResult:
    """Structured result from a model chat call."""

    def __init__(self, content: str | None, tool_calls: list[dict] | None):
        self.content = content
        self.tool_calls = tool_calls

    def has_tool_calls(self) -> bool:
        return bool(self.tool_calls)

    def __repr__(self):
        if self.tool_calls:
            names = [tc["function"]["name"] for tc in self.tool_calls]
            return f"ChatResult(tool_calls={names})"
        return f"ChatResult(content={self.content[:60] if self.content else None})"


class OllamaModel:
    def __init__(self, config):
        self.host = config.ollama_host.rstrip("/")
        self.model = config.model
        self.config = config

    def _post(self, body: dict) -> dict:
        url = f"{self.host}/api/chat"
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            raise RuntimeError(
                f"Ollama HTTP {e.code}: {e.read().decode()[:500]}"
            )
        except Exception as e:
            raise RuntimeError(f"Ollama error: {e}")

    def chat(
        self,
        messages: list[dict],
        tools: list[dict] | None = None,
        **kwargs,
    ) -> ChatResult:
        """Send messages + optional tools. Returns structured result."""
        body = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", self.config.temperature),
                "num_predict": kwargs.get("max_tokens", 8192),
            },
        }
        if tools:
            body["tools"] = tools

        resp = self._post(body)
        msg = resp.get("message", {})

        content = msg.get("content")
        raw_calls = msg.get("tool_calls")

        tool_calls = None
        if raw_calls:
            tool_calls = []
            for tc in raw_calls:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                raw_args = fn.get("arguments", {})
                if isinstance(raw_args, str):
                    try:
                        raw_args = json.loads(raw_args)
                    except json.JSONDecodeError:
                        raw_args = {}
                tool_calls.append({
                    "id": tc.get("id", name),
                    "type": "function",
                    "function": {"name": name, "arguments": raw_args},
                })

        return ChatResult(content=content, tool_calls=tool_calls)

    def embed(self, text: str) -> list[float]:
        body = {"model": "nomic-embed-text:latest", "input": text}
        url = f"{self.host}/api/embed"
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())["embeddings"][0]
        except Exception as e:
            raise RuntimeError(f"Embed error: {e}")
