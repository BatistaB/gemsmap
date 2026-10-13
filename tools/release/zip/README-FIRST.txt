GEMs MAP {{VERSION}} - An Interactive Workbench for Genome-Scale Metabolic Models
==================================================================================

BETA: this version is being tested. It works, but features and file formats can
still change. Save your work as .gemsmap project files and report problems.

START
-----
Windows   Double-click "Start GEMs MAP (Windows).bat".
macOS     Double-click "Start GEMs MAP (macOS).command".
          The very first time macOS blocks files from the internet: right-click
          the file, choose Open, then Open again.
Linux     In a terminal, in this folder:  bash start-gemsmap-linux.sh

GEMs MAP opens in your web browser at http://127.0.0.1:8765. Keep the black
window open while you work; close it (or press Ctrl+C) to stop GEMs MAP.

FIRST START
-----------
The first start needs the internet and takes a few minutes. It prepares
everything inside this folder, in "runtime": the uv tool (if you do not have
it), Python {{PYTHON}}, the scientific libraries (COBRApy, NumPy, SciPy...) and
GEMs MAP. Nothing is installed anywhere else on your computer. Later starts take
a few seconds and work without the internet (except the metabolite analysis,
which looks identifiers up in MetaNetX).

Keep the folder in a place of its own (for example Documents\GEMsMAP), not in
Downloads, and do not move it after the first start. On Windows the folder path
must be short (at most 90 characters, such as C:\GEMsMAP\GEMsMAP-{{VERSION}}),
because Windows limits the length of file paths.

YOUR DATA
---------
Everything runs on your computer; models are not uploaded anywhere. The Map
Builder autosaves to the browser every 5 minutes, but save important work as
files (File > Save project, .gemsmap). The backend keeps a cache of imported
models in your user folder (Windows: %LOCALAPPDATA%\cobragui; macOS and Linux:
~/.cache/cobragui).

UNINSTALL
---------
Delete this folder. To remove the cache too, delete the cobragui folder named
above.

OTHER WAYS TO INSTALL
---------------------
With Python 3.10 or newer:   pip install gemsmap     then run:  gemsmap
With uv:                     uvx gemsmap
Documentation: https://github.com/BatistaB/gemsmap

TROUBLESHOOTING
---------------
- Windows says "Windows protected your PC": click "More info", then "Run anyway".
- "Port 8765 is in use": another program uses that port. Close it, or start
  GEMs MAP on another port, for example (Windows, in this folder):
      "Start GEMs MAP (Windows).bat" --port 8766
  Note: the map autosave belongs to the address, so prefer one port.
- The first start failed half-way (no internet, computer asleep): start again;
  it resumes. If it keeps failing, delete the "runtime" folder and start again.
- The page does not open by itself: open http://127.0.0.1:8765 in your browser.

REPORTING A PROBLEM
-------------------
In COBRAGUI, click "GEMs MAP {{VERSION}}" in the bottom bar, then "Copy
diagnostics", and paste it into your report together with what you did and what
happened: https://github.com/BatistaB/gemsmap/issues

GEMs MAP is released under the MIT License. It is an independent project, not
maintained or endorsed by the COBRApy, BiGG, MetaNetX or KEGG teams.
