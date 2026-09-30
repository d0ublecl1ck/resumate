"""Allow 'python -m resumate_agent_core' to run the same CLI entry point (89ffd)."""

from .cli import main

if __name__ == "__main__":  # pragma: no cover - exercised through the console script
    raise SystemExit(main())
