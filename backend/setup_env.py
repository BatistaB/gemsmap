"""Create backend/.venv and install the backend requirements: python backend/setup_env.py"""
import os
import subprocess
import sys
import venv

here = os.path.dirname(os.path.abspath(__file__))
env = os.path.join(here, ".venv")
if not os.path.isdir(env):
    print("creating", env)
    venv.create(env, with_pip=True)
py = os.path.join(env, "Scripts" if os.name == "nt" else "bin", "python")
subprocess.check_call([py, "-m", "pip", "install", "--upgrade", "pip"])
subprocess.check_call([py, "-m", "pip", "install", "-r", os.path.join(here, "requirements.txt")])
print("\nBackend ready. Start it with: npm run backend")
