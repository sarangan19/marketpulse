from marketpulse.alerts import evaluate


def test_upper_breached_lower_clear():
    assert evaluate(201, 200, 150) == {"UPPER": "BREACHED", "LOWER": "CLEAR"}


def test_lower_only():
    assert evaluate(150, None, 150) == {"LOWER": "BREACHED"}


def test_inside_band():
    assert evaluate(175, 200, 150) == {"UPPER": "CLEAR", "LOWER": "CLEAR"}


def test_upper_boundary_inclusive():
    assert evaluate(200, 200, None) == {"UPPER": "BREACHED"}


def test_no_thresholds():
    assert evaluate(100, None, None) == {}
