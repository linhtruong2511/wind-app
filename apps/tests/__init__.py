"""
End-to-end integration and frontend contract test package.
"""

import os


def load_tests(loader, tests, pattern):
    this_dir = os.path.dirname(__file__)
    pkg_tests = loader.discover(start_dir=this_dir, pattern=pattern or "test*.py")
    tests.addTests(pkg_tests)
    return tests
