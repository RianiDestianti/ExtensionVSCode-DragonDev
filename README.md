# Pet Dragon 🐉

A cute animated dragon companion that lives inside VS Code. It flaps its wings,
blinks, breathes fire, and grows up as you code.

## Features

- **Lives in its own sidebar** — click the 🐉 icon in the Activity Bar to see a
  cute animated **pixel-art** baby dragon hopping around a grassy field, flapping
  its wings, blinking, and breathing fire.
- **Feed / Play / Fire** — use the buttons in the view (or the title-bar icons),
  or just click the dragon itself to pet it.
- **Stats that decay over time** — hunger, happiness and energy change while you
  work, so your dragon feels alive between sessions.
- **Level up as you code** — every time you save a file the dragon earns XP.
  Level-ups pop a celebration.
- **Status bar buddy** — shows your dragon's name, level and mood at a glance.
- **5 scale colors** — emerald, crimson, sapphire, amethyst, gold.
- **Persistent** — your dragon's name, level and stats are saved globally.

## Try it now (no install)

1. Open this folder in VS Code.
2. Press **F5** ("Run Pet Dragon Extension"). A new *Extension Development Host*
   window opens with the extension loaded.
3. In that window, click the **🐉 dragon icon** in the Activity Bar (left edge).

## Commands

| Command | What it does |
| --- | --- |
| `Pet Dragon: Show the Dragon` | Reveals the dragon sidebar |
| `Pet Dragon: Feed the Dragon` | Restores hunger |
| `Pet Dragon: Play with the Dragon` | Boosts happiness (costs energy) |
| `Pet Dragon: Breathe Fire!` | Just for fun 🔥 |
| `Pet Dragon: Rename the Dragon` | Give it a name |
| `Pet Dragon: Reset the Dragon` | Hatch a fresh one |

## Settings

- `petDragon.xpPerSave` — XP earned per file save (default `8`).
- `petDragon.showInStatusBar` — toggle the status bar buddy.
- `petDragon.color` — dragon scale color.

## Install permanently

Package it into a `.vsix` and install:

```bash
npm install -g @vscode/vsce
vsce package
code --install-extension pet-dragon-1.0.0.vsix
```

Enjoy your dragon! 🐲
