# backend/tests/conftest.py
# Runs before any test module is collected.
# Ensures the DB schema exists and serial is mocked for CI.

import os
from unittest.mock import patch

# Must be set before importing main
os.environ.setdefault("SERIAL_PORT", "/dev/null")

# Patch serial.Serial so the import-time side-effects don't crash on CI
with patch("serial.Serial", side_effect=Exception("CI: no serial port")):
    import main  # noqa: E402  (import after env/mock setup)

# TestClient(app) at module level does NOT trigger the lifespan context,
# so init_db() never runs. Call it explicitly here before any test.
main.init_db()
