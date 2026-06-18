import os
import json
from pathlib import Path

DEFAULTS = {
    "model": "mistral:latest",
    "ollama_host": "http://localhost:11434",
    "max_turns": 25,
    "max_tool_retries": 3,
    "workspace": os.getcwd(),
    "verbose": False,
    "temperature": 0.3,
}


class Config:
    def __init__(self, **overrides):
        self._data = dict(DEFAULTS)
        self._data.update(overrides)
        self._data["workspace"] = os.path.abspath(self._data["workspace"])

    def __getattr__(self, name):
        if name in self._data:
            return self._data[name]
        raise AttributeError(f"no config key: {name}")

    def __setattr__(self, name, value):
        if name.startswith("_"):
            super().__setattr__(name, value)
        else:
            self._data[name] = value

    def save(self, path: str):
        Path(path).write_text(json.dumps(self._data, indent=2))

    @classmethod
    def load(cls, path: str):
        if os.path.exists(path):
            data = json.loads(Path(path).read_text())
            return cls(**data)
        return cls()
