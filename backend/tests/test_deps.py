from app.core.deps import get_current_user


def test_current_user_is_the_single_local_owner() -> None:
    user = get_current_user()

    assert user.id == "user_local"
