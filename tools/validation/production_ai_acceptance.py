"""
SafeVision AI - Root Runner for Production AI Acceptance Suite
Delegates to ai/scripts/production_ai_acceptance.py
"""

import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ai_dir = os.path.join(root_dir, "ai")
if ai_dir not in sys.path:
    sys.path.insert(0, ai_dir)

from scripts.production_ai_acceptance import run_acceptance

if __name__ == "__main__":
    status, _ = run_acceptance()
    if status == "FAIL":
        sys.exit(1)
    elif status == "BLOCKED":
        sys.exit(2)
    sys.exit(0)
