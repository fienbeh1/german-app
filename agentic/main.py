#!/usr/bin/env python3
"""
agentic — autonomous CLI agent.
Usage:
  python -m agentic.main "your goal here"
  python -m agentic.main --file goal.txt
  python -m agentic.main --interactive
"""

import sys
import os
import argparse
import textwrap
from pathlib import Path

from .config import Config
from .agent import Agent


def main():
    parser = argparse.ArgumentParser(
        description="agentic — autonomous CLI agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python -m agentic.main "Refactor the API routes in server.js"
              python -m agentic.main --file goal.txt
              python -m agentic.main --interactive
              python -m agentic.main --model ger:latest "Debug the audio endpoint"
        """),
    )
    parser.add_argument("goal", nargs="?", help="goal description")
    parser.add_argument("--file", "-f", help="read goal from a text file")
    parser.add_argument(
        "--interactive", "-i", action="store_true",
        help="interactive mode — type goals one at a time",
    )
    parser.add_argument("--model", "-m", help="Ollama model to use")
    parser.add_argument(
        "--workspace", "-w", default=os.getcwd(),
        help="working directory (default: cwd)",
    )
    parser.add_argument(
        "--max-turns", type=int, default=25,
        help="max agent turns (default: 25)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="verbose output",
    )
    parser.add_argument(
        "--list-tools", action="store_true",
        help="list available tools and exit",
    )

    args = parser.parse_args()

    overrides = {}
    if args.model:
        overrides["model"] = args.model
    if args.workspace:
        overrides["workspace"] = os.path.abspath(args.workspace)
    if args.max_turns:
        overrides["max_turns"] = args.max_turns
    if args.verbose:
        overrides["verbose"] = True

    config = Config(**overrides)
    os.chdir(config.workspace)

    if args.list_tools:
        from .tools import ToolRegistry
        registry = ToolRegistry()
        print("Available tools:")
        print(registry.descriptions())
        return

    if args.interactive:
        _interactive_loop(config)
        return

    goal = None
    if args.goal:
        goal = args.goal
    elif args.file:
        goal = Path(args.file).read_text().strip()
    else:
        parser.print_help()
        sys.exit(1)

    agent = Agent(config)
    try:
        result = agent.run(goal)
        if result:
            print(f"\nResult:\n{result}", flush=True)
    except KeyboardInterrupt:
        print("\nInterrupted by user.", flush=True)
        sys.exit(130)
    except Exception as e:
        print(f"\nAgent crashed: {e}", flush=True)
        import traceback as tb
        tb.print_exc()
        sys.exit(1)


def _interactive_loop(config):
    print("Agentic interactive mode. Type your goal, or 'quit' to exit.", flush=True)
    while True:
        try:
            goal = input("\n❯ ")
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not goal or goal.lower() in ("quit", "exit", "q"):
            break
        agent = Agent(config)
        try:
            agent.run(goal)
        except Exception as e:
            print(f"Error: {e}", flush=True)


if __name__ == "__main__":
    main()
