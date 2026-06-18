"""
Orchestrator — plans, delegates, monitors task execution.
Maintains a task graph and tracks progress.
"""

import json
import time
import textwrap
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Task:
    id: str
    description: str
    status: str = "pending"  # pending | in_progress | completed | failed | cancelled
    subtasks: list["Task"] = field(default_factory=list)
    result: str | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "status": self.status,
            "subtasks": [s.to_dict() for s in self.subtasks],
            "result": self.result,
            "error": self.error,
        }


class Orchestrator:
    """Manages a task tree and provides the agent with planning context."""

    def __init__(self, goal: str):
        self.goal = goal
        self.tasks: list[Task] = []
        self._task_counter = 0
        self.max_depth = 5

    def _next_id(self) -> str:
        self._task_counter += 1
        return f"T{self._task_counter}"

    def add_task(self, description: str, parent: Task | None = None) -> Task:
        t = Task(id=self._next_id(), description=description)
        if parent:
            parent.subtasks.append(t)
        else:
            self.tasks.append(t)
        return t

    def update_task(self, task: Task, status: str, result: str | None = None,
                    error: str | None = None):
        task.status = status
        if result is not None:
            task.result = result
        if error is not None:
            task.error = error

    def pending_tasks(self) -> list[Task]:
        result = []
        def _walk(tasks):
            for t in tasks:
                if t.status == "pending":
                    result.append(t)
                _walk(t.subtasks)
        _walk(self.tasks)
        return result

    def summary(self) -> str:
        lines = [f"Goal: {self.goal}", f"Total tasks: {self._count_all(self.tasks)}"]
        lines.append(self._render_tree(self.tasks, 0))
        return "\n".join(lines)

    def _count_all(self, tasks: list[Task]) -> int:
        return sum(1 + self._count_all(t.subtasks) for t in tasks)

    def _render_tree(self, tasks: list[Task], depth: int) -> str:
        lines = []
        for t in tasks:
            icon = {"pending": "○", "in_progress": "●",
                    "completed": "✓", "failed": "✗", "cancelled": "—"}.get(t.status, "?")
            indent = "  " * depth
            line = f"{indent}{icon} [{t.id}] {t.description}"
            if t.status == "failed" and t.error:
                line += f"  ({t.error[:60]})"
            if t.status == "completed" and t.result:
                line += f"  → {t.result[:80]}"
            lines.append(line)
            lines.append(self._render_tree(t.subtasks, depth + 1))
        return "\n".join(lines)

    def plan(self, model_response: str):
        """Parse a plan from the model's response and create task tree."""
        lines = model_response.strip().split("\n")
        stack = [None]
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("//"):
                continue
            indent = len(line) - len(line.lstrip())
            depth = indent // 2
            parent = None
            for d in range(depth, -1, -1):
                if d < len(stack) and stack[d] is not None:
                    parent = stack[d]
                    break
            task = self.add_task(stripped, parent=parent)
            while len(stack) <= depth:
                stack.append(None)
            stack[depth] = task


def build_plan_prompt(goal: str, context: str = "") -> str:
    return textwrap.dedent(f"""\
    You are a task planner. Decompose the following goal into a hierarchical
    task plan. Use YAML-like indentation (2 spaces per level).

    Guidelines:
    - Max 5 top-level tasks.
    - Each task should be concrete and actionable.
    - No duplicate or redundant tasks.
    - Keep it focused on what actually needs to happen.

    Goal: {goal}

    {f"Context:\n{context}" if context else ""}

    Output only the task plan, nothing else.
    Example:
    Task 1: Set up database schema
      Task 1.1: Create users table
      Task 1.2: Create posts table
    Task 2: Implement API endpoints
      Task 2.1: GET /api/users
      Task 2.2: POST /api/users
    """)
