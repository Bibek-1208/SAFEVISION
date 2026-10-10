"""
SafeVision AI — Backward-compatible forwarder
Forwarding execution to tools/validation/phase6_validation_suite.py
"""

import os
import sys
import runpy

if __name__ == "__main__":
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = os.path.join(root_dir, "tools", "validation", "phase6_validation_suite.py")
    runpy.run_path(target, run_name="__main__")
