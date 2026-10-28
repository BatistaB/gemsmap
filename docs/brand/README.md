# GEMsMAP brand

<p>
  <img src="gemsmap-logo.png" alt="GEMsMAP logo" width="360">
</p>

## Name

**GEMsMAP**: one word, *GEMs* with a lowercase *s* (the plural of GEM, genome-scale metabolic model, and gems,
the stones) followed by *MAP* in capitals. Write it this way in text, titles and figures. Avoid *GEMs MAP* (with a
space), *GEMSMAP*, *GemsMap* and *GEMsMap*. The logo sets the two parts on two lines; the name is still one word.
Where a lowercase or code token is needed (package name, file extension, storage keys, environment variables) use
`gemsmap` or `GEMSMAP_…`.

Tagline: *An interactive workbench for visualization and constraint-based analysis of genome-scale metabolic models.*

## The logo

- **The gem.** A diamond drawn as a metabolic network: 8 nodes (metabolites) and 15 edges (reactions). The edges
  use the colours of a flux map: red and blue for the two directions, paler for smaller fluxes. The nodes have a
  black ring and the girdle is a thin ink line, so the coloured edges carry the picture. A GEM is a network, and
  the network is a gem.
- **The cobra.** The snake around the stem of the **P** stands for COBRA (constraint-based reconstruction and
  analysis). COBRApy runs COBRAGUI.
- **The type.** A heavy slab serif, close to Roboto Slab ExtraBold (800). Interface text is Inter.

## Files

| File | Use |
| --- | --- |
| [`gemsmap-logo.png`](gemsmap-logo.png) | Full logo for light backgrounds (transparent PNG, 1600 px wide) |
| [`gemsmap-logo-dark.png`](gemsmap-logo-dark.png) | Full logo for dark backgrounds: white ink, brighter edges |
| [`gemsmap-logo-mono.png`](gemsmap-logo-mono.png) | One colour, for print and greyscale |
| [`gemsmap-mark.svg`](gemsmap-mark.svg) | The gem on its own, as a vector. Switches to the dark palette on dark backgrounds |
| [`../../public/favicon.svg`](../../public/favicon.svg) | Browser icon: the gem with heavier strokes for 16–32 px (also `docs/assets/brand/favicon.svg`) |
| `../assets/brand/gemsmap-mark-{light,dark}.svg` | The documentation site's header, one per colour scheme |
| `src/ui/BrandMark.tsx` | The gem alone in the app's top bar, without the wordmark (UI stroke weights) |

The master is [`logo/gemsmap-logo.png`](../../logo/gemsmap-logo.png) (1920 × 1080); the older JPGs and the sketch of
earlier versions are kept next to it. **All the files above are generated** by `tools/brand/make_brand.py`
(Pillow, see `tools/docs/requirements.txt`): it lifts the wordmark off the master's white background and redraws
the gem as a vector from one definition (nodes, edges, colours, weights), so it stays sharp and can switch to the
dark palette. After a change to a master or to the gem, run it again and update `src/ui/BrandMark.tsx` to match.
The gem has three stroke weights so it reads at every size (node radius / ring / edge / girdle, in units where
the top row is 180 wide): display, ≥ 96 px, 16 / 3.4 / 7 / 3.2; UI, 24 / 5 / 13 / 6; favicon, 28 / 5.5 / 17 / 8.

## COBRAGUI

COBRAGUI (COBRA graphical user interface) is the workspace that drives COBRApy. It ships inside GEMsMAP but has
its own name and logo, because it is meant to grow into a front end for more of the COBRA ecosystem.

<p>
  <img src="cobragui-logo.png" alt="COBRAGUI logo" width="300">
</p>

- **The logo.** *cobra* in a round sans-serif, with a small network of coloured reactions in the *o*; *GUI* with
  the cobra as the *I* (the same snake as in the GEMsMAP **P**); a screen with the GEMsMAP gem and charts:
  COBRAGUI is a window onto the same network.
- **The name.** Write *COBRAGUI* in text, one word, in capitals (COBRA is an acronym). In identifiers: `cobragui`.
- **Where it appears.** At the left of the COBRAGUI header row in the app (the gem stays in the top left corner
  for GEMsMAP), at the top of the COBRAGUI section of the documentation and of the README.

| File | Use |
| --- | --- |
| [`cobragui-logo.png`](cobragui-logo.png) | Light backgrounds (transparent PNG, 1200 px wide) |
| [`cobragui-logo-dark.png`](cobragui-logo-dark.png) | Dark backgrounds: white ink, the colours unchanged |
| [`../../public/brand/cobragui-logo.png`](../../public/brand/cobragui-logo.png) | The app's header (120 px high, shown at 32 px) |

The master is [`logo/cobragui-logo.png`](../../logo/cobragui-logo.png); `tools/brand/make_brand.py` makes the transparent files.

## Colours

| Role | Light background | Dark background |
| --- | --- | --- |
| Nodes (fill / ring) | `#262626` / `#000000` | `#dcdcdc` / `#ffffff` |
| Girdle, wordmark | `#000000` | `#ededed` |
| Strongest blue edge | `#1800ad` | `#8f8cff` |
| Blue edges | `#4c49f6` `#736eeb` | `#7471ff` `#5b59b8` |
| Pale blue edges | `#7e7fff` `#9e9bfe` | `#4a48a0` `#3a3880` |
| Red edges | `#ff5757` `#ff3131` `#f24e50` | `#ff6b6b` `#ff4d55` `#f2606a` |
| Pale red edges | `#f3cada` `#ffbbbc` | `#6b3a4a` `#6e3a3c` |

On a dark background the strong edges are the brightest and the pale ones fade into the background, as they do
on a light background.

## Use

- Leave free space around the logo of at least the height of the gem's top row (one node diameter is the minimum).
- Minimum width: about 120 px for the full logo and 16 px for the gem.
- Use the dark variant on dark backgrounds. Do not invert the light PNG.
- Do not recolour single edges, change the network, stretch the logo or set the wordmark in another typeface.
