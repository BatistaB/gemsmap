# Installation

!!! warning "Beta"
    GEMs MAP 0.3 is in beta testing. It works, but features, file formats and the interface can still change before the first stable release. Save your work as `.gemsmap` project files, and please [report problems](https://github.com/BatistaB/gemsmap/issues/new/choose).

GEMs MAP runs on your own computer. One command starts a small local server and opens the application in your web browser. Your models are not uploaded anywhere; the internet is needed only to install, and for the identifier lookups of the [metabolite analysis](../cobra-gui/metabolite-analysis.md) (MetaNetX).

## Requirements

| | |
| --- | --- |
| System | Windows 10 or 11, macOS, or Linux |
| Python | 3.10 to 3.14, for the *pip* installation. The *uv* and *zip* installations bring their own Python. |
| Browser | A current Chromium-based browser (Chrome, Edge, Brave, Opera), Firefox or Safari |
| Disk | About 450 MB for the scientific libraries (COBRApy, NumPy, SciPy, pandas); the zip folder takes about 650 MB, its download cache included |

Each release is installed and tested automatically on Windows, macOS (Apple Silicon) and Ubuntu, with Python 3.10, 3.12 and 3.14, and the zip on the three systems. Intel Macs are not tested automatically.

## Install

Choose one way. If you already use Python, take **pip**; if you have never installed Python, take **uv** or the **zip**.

=== "pip (recommended)"

    ```bash
    pip install gemsmap
    ```

    Install GEMs MAP in a Python environment of its own (a [venv](https://docs.python.org/3/library/venv.html) or a conda environment), so its libraries do not interfere with other projects. **Never created one?** Follow [Step by step: install with pip](#step-by-step-install-with-pip) below: it explains each command and what you should see, and takes about ten minutes.

    The first installation downloads COBRApy and the scientific libraries, a few hundred MB, and can take several minutes.

=== "uv (no Python needed)"

    [uv](https://docs.astral.sh/uv/) installs Python itself when needed. Install uv once, following [its installation guide](https://docs.astral.sh/uv/getting-started/installation/), then either run GEMs MAP directly:

    ```bash
    uvx gemsmap
    ```

    or install the `gemsmap` command permanently:

    ```bash
    uv tool install gemsmap
    ```

    This is also the easiest way on Ubuntu and Debian, whose Python often comes without `venv` and refuses system-wide `pip install`.

=== "Zip (double-click)"

    1. Download `GEMsMAP-<version>.zip` from the [releases on GitHub](https://github.com/BatistaB/gemsmap/releases).
    2. Extract it to a folder of its own, for example `C:\GEMsMAP` or your *Documents* folder. On Windows the folder path must be short (at most 90 characters), because Windows limits the length of file paths.
    3. Start it:
        - **Windows:** double-click *Start GEMs MAP (Windows).bat*. If Windows says *Windows protected your PC*, click *More info*, then *Run anyway*.
        - **macOS:** double-click *Start GEMs MAP (macOS).command*. The very first time, macOS blocks files downloaded from the internet: right-click the file, choose *Open*, then *Open* again.
        - **Linux:** in a terminal, in that folder, run `bash start-gemsmap-linux.sh`.

    The first start needs the internet and takes a few minutes. It shows three steps (uv, Python, GEMs MAP) and prepares everything **inside that folder**, in `runtime`; nothing is installed elsewhere. Later starts take a few seconds. `README-FIRST.txt` in the zip explains the rest.

=== "From source (developers)"

    Requires [Node.js](https://nodejs.org/) 18 or newer and Python 3.10 or newer. From a clone of the [repository](https://github.com/BatistaB/gemsmap):

    ```bash
    npm install
    npm run backend:setup
    ```

    Then, in two terminals, `npm run backend` (the COBRApy backend on port 8765) and `npm run dev` (the interface on http://localhost:5173, which forwards `/api` to the backend). See `CONTRIBUTING.md` in the repository for tests and conventions.

## Step by step: install with pip

This section is for anyone who has not used a terminal or a Python environment before. It installs GEMs MAP with pip in a **virtual environment**: a folder with its own copy of Python and its own libraries. GEMs MAP and its scientific libraries go into that folder instead of the Python of your system, so they cannot conflict with other projects, and deleting the folder removes everything. You create the environment once; afterwards you only activate it.

Choose your system in any of the tabs below; the other tabs on this page follow your choice. Type or paste each command, press ++enter++, and wait until the terminal is ready for the next one.

### 1. Open a terminal

=== "Windows"

    Press the ++windows++ key, type **PowerShell** and press ++enter++. The commands for Windows on this page are for PowerShell.

=== "macOS"

    Open **Terminal**: press ++cmd+space++, type **Terminal** and press ++enter++ (or *Applications → Utilities → Terminal*).

=== "Linux"

    Open your distribution's terminal, often with ++ctrl+alt+t++.

### 2. Check that Python is installed

=== "Windows"

    ```powershell
    python --version
    ```

    You should see a version from **Python 3.10** to **3.14**, for example `Python 3.14.2`.

    - If the command is not found, or the Microsoft Store opens, Python is not installed: download it from [python.org](https://www.python.org/downloads/), and on the first screen of the installer tick **Add python.exe to PATH**. Then close PowerShell, open it again and repeat this step.
    - Some installations have the `py` launcher instead of `python`, or both. If only `py --version` works, use `py` instead of `python` in step 4. After step 5, `python` always works.

=== "macOS"

    ```bash
    python3 --version
    ```

    You should see a version from **Python 3.10** to **3.14**, for example `Python 3.14.2`. If the command is not found, or the version is older, install Python from [python.org](https://www.python.org/downloads/).

=== "Linux"

    ```bash
    python3 --version
    ```

    You should see a version from **Python 3.10** to **3.14**, for example `Python 3.12.3`. If your distribution has an older Python, the [uv installation](#install) is the easiest way: it brings its own Python.

### 3. Create a folder for GEMs MAP

=== "Windows"

    ```powershell
    mkdir $HOME\gemsmap
    cd $HOME\gemsmap
    ```

    This makes a folder `gemsmap` in your user folder and moves the terminal into it; PowerShell answers the first command with a short table describing the new folder. Any other folder works too, for example `D:\gemsmap` on a second drive: use that path in both commands.

=== "macOS"

    ```bash
    mkdir ~/gemsmap
    cd ~/gemsmap
    ```

    This makes a folder `gemsmap` in your home folder and moves the terminal into it. Any other folder works too.

=== "Linux"

    ```bash
    mkdir ~/gemsmap
    cd ~/gemsmap
    ```

    This makes a folder `gemsmap` in your home folder and moves the terminal into it. Any other folder works too.

The line where you type now ends with the folder's name, for example `PS C:\Users\you\gemsmap>`. That is how you can always tell where the terminal is.

### 4. Create the environment

=== "Windows"

    ```powershell
    python -m venv .venv
    ```

    It takes a few seconds and **prints nothing** when it works. Check with `dir`: the folder now contains a folder `.venv`.

=== "macOS"

    ```bash
    python3 -m venv .venv
    ```

    It takes a few seconds and **prints nothing** when it works. Check with `ls -a`: the folder now contains a folder `.venv` (Finder hides folders whose name starts with a dot).

=== "Linux"

    ```bash
    python3 -m venv .venv
    ```

    It takes a few seconds and **prints nothing** when it works. Check with `ls -a`: the folder now contains a folder `.venv`.

    On Ubuntu and Debian, an error saying *ensurepip is not available* means the venv module is missing. Install it with `sudo apt install python3-venv`, delete the half-made folder with `rm -rf .venv`, and repeat this step.

### 5. Activate the environment

=== "Windows"

    ```powershell
    .\.venv\Scripts\Activate.ps1
    ```

    If PowerShell answers in red that *running scripts is disabled on this system*, allow scripts for this window only, then activate again:

    ```powershell
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\.venv\Scripts\Activate.ps1
    ```

    If it asks you to confirm, type the letter shown for *Yes* and press ++enter++. The setting ends when you close the window and changes nothing else on your computer. In the Command Prompt (`cmd`) instead of PowerShell, activate with `.venv\Scripts\activate.bat`.

=== "macOS"

    ```bash
    source .venv/bin/activate
    ```

=== "Linux"

    ```bash
    source .venv/bin/activate
    ```

The line where you type now starts with **`(.venv)`**, for example `(.venv) PS C:\Users\you\gemsmap>`. While it is there, the environment is active: `python` and `pip` are the ones inside `.venv`, and everything you install goes there. The activation lasts until you close the terminal (or type `deactivate`).

### 6. Update pip

pip is the program that installs Python packages. A current pip finds the right files for your system faster and with fewer problems:

```bash
python -m pip install --upgrade pip
```

### 7. Install GEMs MAP

```bash
pip install gemsmap
```

pip downloads GEMs MAP and the scientific libraries it needs (COBRApy, NumPy, SciPy, pandas…), a few hundred MB. It can take several minutes and prints many lines. Wait until the line with `(.venv)` comes back. One of the last lines starts with **`Successfully installed`** and lists the installed packages, `gemsmap` among them, with its version, for example `gemsmap-0.3.0b1`.

### 8. Check and start

```bash
gemsmap diagnose
gemsmap
```

`gemsmap diagnose` prints the versions of GEMs MAP, Python and COBRApy and the solvers it found. `gemsmap` starts GEMs MAP and opens it in your browser: see [Start](#start) below. Keep the terminal open while you work, and press ++ctrl+c++ in it to stop GEMs MAP.

### Next time

The environment is already there: open a terminal, go to the folder, activate, start.

=== "Windows"

    ```powershell
    cd $HOME\gemsmap
    .\.venv\Scripts\Activate.ps1
    gemsmap
    ```

=== "macOS"

    ```bash
    cd ~/gemsmap
    source .venv/bin/activate
    gemsmap
    ```

=== "Linux"

    ```bash
    cd ~/gemsmap
    source .venv/bin/activate
    gemsmap
    ```

To update GEMs MAP later, activate the environment and run `pip install --upgrade gemsmap` (see [Update](#update)). To remove it, close GEMs MAP and delete the `gemsmap` folder: the environment and everything installed in it go with it. Your data are kept separately (see [Where your data are](#where-your-data-are)).

## Start

```bash
gemsmap
```

GEMs MAP opens in your browser at **http://127.0.0.1:8765**. Keep the window where the command runs open while you work; close it or press ++ctrl+c++ to stop GEMs MAP. With the zip, the *Start GEMs MAP* file does the same. If the page does not open by itself, open that address in your browser.

The start screen of COBRAGUI confirms that everything works: it lists the GEMs MAP version, the COBRApy version and the solver, for example *GEMs MAP 0.3.0b1 · COBRApy 0.32.1 · solver GLPK · backend ready*.

<figure class="gm-shot" markdown>
![The COBRAGUI start screen: a drop zone reading "Drop a metabolic model here", the accepted formats SBML, COBRA JSON and MATLAB .mat, an Import model button, links to two example models bundled with COBRApy, and a status line with the COBRApy version and the solver.](../assets/images/cobra-gui-import.png)
<figcaption>COBRAGUI after the start: drop a model file or open one of the two examples bundled with COBRApy (<em>E. coli</em> core and iJO1366).</figcaption>
</figure>

| Command | Effect |
| --- | --- |
| `gemsmap` | Start GEMs MAP and open it in the browser. If it is already running, only open the browser. |
| `gemsmap --port 8766` | Use another port, for example when 8765 is taken. |
| `gemsmap --no-browser` | Start without opening the browser. |
| `gemsmap diagnose` | Print the versions, the solvers and the data folder, for a bug report. |
| `gemsmap bigg-data` | Install the optional BiGG tables (below). |
| `gemsmap --version` | Print the version. |

If the `gemsmap` command is not found, `python -m gemsmap` does the same.

!!! tip "Keep one address"
    The Map Builder autosaves your session in the browser, and the browser keeps that per address, port included. Use the same port every time (8765 by default), and save important work as `.gemsmap` files with *File → Save project*.

## Update

| Installed with | Update with |
| --- | --- |
| pip | `pip install --upgrade gemsmap` |
| uv | `uv tool upgrade gemsmap`, or `uvx gemsmap@latest` |
| zip | Download the new zip and extract it to a new folder (its first start prepares it again). |

While GEMs MAP has only beta versions, these commands install the newest beta. Once a stable version exists, a newer beta has to be named explicitly, for example `pip install gemsmap==0.4.0b1`.

## Uninstall

`pip uninstall gemsmap` or `uv tool uninstall gemsmap`; for the zip, delete its folder. Your data stay where they are (next section) until you delete them.

## Where your data are

| What | Where |
| --- | --- |
| Projects you save (`.gemsmap`), exported figures and tables | Wherever you save them |
| Map Builder autosave, COBRAGUI sessions (states, results), your templates | The browser's storage for http://127.0.0.1:8765 |
| Cached model files, curation, edit logs, MetaNetX lookups, BiGG tables | `%LOCALAPPDATA%\cobragui` (Windows) or `~/.cache/cobragui` (macOS, Linux); `gemsmap diagnose` prints it |

Clearing the browser's data for that address removes the autosave and the COBRAGUI sessions.

## Optional: BiGG tables for templates

The template identity tools and the metabolite analysis can use the universal metabolite and reaction tables of [BiGG Models](https://bigg.bio) as an offline knowledge base. Install them once (about 19 MB):

```bash
gemsmap bigg-data
```

Or use the two JSON files you downloaded yourself from the BiGG data-access page: `gemsmap bigg-data --from path/to/folder`. In a development checkout the command is `npm run bigg:data`. GEMs MAP reads the tables locally and never calls the BiGG API.

## Configuration

| Variable | Default | Effect |
| --- | --- | --- |
| `GEMSMAP_PORT` | `8765` | Default port of the `gemsmap` command. |
| `COBRAGUI_CACHE` | see *Where your data are* | Folder for cached model files, curation layers and edit logs; the MetaNetX cache and the BiGG tables live in its parent folder. |
| `METANETX_SPARQL` | `https://rdf.metanetx.org/sparql` | MetaNetX endpoint used by the metabolite analysis. |
| `COBRAGUI_PORT`, `VITE_COBRA_API` | `8765`, `/api` | Development checkout only: port of `npm run backend`, and the backend URL used by `npm run dev`. |

## Check the installation

```bash
gemsmap diagnose
```

It prints the GEMs MAP, Python, COBRApy and solver versions, whether the web interface is included, and the data folder. If something does not work, see [Troubleshooting](../reference/troubleshooting.md#installation-and-start), and paste this output into your [report](https://github.com/BatistaB/gemsmap/issues/new/choose).

<div class="gm-next" markdown>
**Next:** take the [first look](first-look.md) at the window, or go straight to [importing a model](../cobra-gui/importing-models.md).
</div>
