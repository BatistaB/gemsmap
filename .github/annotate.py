"""stdin -> one GitHub Actions annotation message (newlines and % escaped).

Used by the release workflow: its job logs need a login to read, while annotations are public.
"""
import sys

text = sys.stdin.read()[-6000:]
sys.stdout.write(text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A"))
