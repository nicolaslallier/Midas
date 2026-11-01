from backend.main import greet


def test_greet_defaults_to_world() -> None:
    assert greet() == "Hello, world!"


def test_greet_uses_name() -> None:
    assert greet("Midas") == "Hello, Midas!"
