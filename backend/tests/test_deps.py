from app.core.deps import CurrentUser, get_pagination


def test_current_user_carries_role() -> None:
    user = CurrentUser(id="user_test", display_name="测试用户", role="admin")

    assert user.role == "admin"


def test_pagination_params() -> None:
    params = get_pagination(page=2, size=50)

    assert (params.page, params.size) == (2, 50)
