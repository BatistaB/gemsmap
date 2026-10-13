# Releasing a new version

Maintainer notes (not part of the documentation website). The repository is public at
<https://github.com/BatistaB/gemsmap>; the package is published on PyPI as `gemsmap`.

## Before a release

1. Nothing private is tracked: unpublished models and results stay in `my_projects/` (git-ignored); personal
   patterns live in `.git/info/exclude` and `.git/info/release-private-patterns`, which are never committed.
   `git status` must list nothing private.
2. Tests pass: `npm run typecheck`, `npm test`, `npm run backend:test`, and `mkdocs build --strict` for the docs.
3. A local trial build works: `python tools/release/build.py` (needs `pip install build`), then install
   `release/gemsmap-*.whl` in a new environment and run `python tools/release/smoke_test.py --python <its python>`.

## Release

1. Choose the version (PEP 440): `0.3.0b2` for the next beta, `0.3.0rc1` for a release candidate, `0.3.0` for
   the final version. A version can be uploaded to PyPI only once, so every fix needs a new number.
2. Set it in `backend/gemsmap/__init__.py` and in `package.json` (SemVer form: `0.3.0-beta.2`), then run
   `npm install --package-lock-only`. A test checks that both agree.
3. In `CHANGELOG.md`, rename *Unreleased* to the version and date, add a new empty *Unreleased*, and update the
   links at the bottom.
4. Commit (`chore(release): 0.3.0b2`), push `main`, and push the tag:

   ```bash
   git tag v0.3.0b2
   git push origin main v0.3.0b2
   ```

5. The *Release* workflow (`.github/workflows/release.yml`) builds the files, installs and tests them on Linux,
   Windows and macOS, publishes to PyPI (Trusted Publishing, no token) and drafts a GitHub release. Open
   *Releases* on GitHub, check the draft and click **Publish release**.
6. Testers update with `pip install --upgrade gemsmap` (while only pre-releases exist; afterwards
   `pip install --upgrade gemsmap==0.3.0b2`), or download the new zip.

## One-time setup (done for 0.3.0b1)

- PyPI: *Your account → Publishing → Add a new pending publisher*: project `gemsmap`, owner `BatistaB`,
  repository `gemsmap`, workflow `release.yml`, environment `pypi`. After the first upload it becomes a normal
  trusted publisher of the project.
- Optional, for the thesis and the paper: connect the repository to [Zenodo](https://zenodo.org/) to get a
  citable DOI for each GitHub release.
