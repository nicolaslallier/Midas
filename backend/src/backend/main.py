"""Entry point for the Midas backend."""


def greet(name: str = "world") -> str:
    """Return a greeting for *name*."""
    return f"Hello, {name}!"


def main() -> None:
    print(greet("Midas"))


if __name__ == "__main__":
    main()
