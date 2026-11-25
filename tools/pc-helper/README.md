# Design Scheduling helper (per PC)

Two things a browser can't do on its own:

- **Open in Explorer.** A folder link's **Open** button opens the folder in File Explorer, and a
  Word document in a folder's file list is shown selected there.
- **New job from anywhere.** Ctrl+Alt+N (or the key chosen at install) opens the app's New job
  box in a small window, over SolidWorks, AutoCAD or anything else.

## Setting up a PC

1. Copy this folder somewhere on the PC, or keep it in Stella Systems so every PC can reach it.
2. Double-click **Install.cmd**. It finds Stella Systems through OneDrive (it asks if it can't),
   asks for the hotkey, and sets everything up for the Windows user running it. It doesn't need
   administrator rights.
3. In the app, tick **Open in Explorer is set up on this PC** under the cog (Settings › This PC).
4. The first time a folder opens, the browser asks whether to open the helper. Tick **Always
   allow**, then **Open**.

**Uninstall.cmd** takes it all off again.

## What it does

`install.ps1` builds `StellaHelper.exe` from `StellaHelper.cs` with the C# compiler that comes
with Windows, so no program file is passed around. It goes in
`%LOCALAPPDATA%\Stella\Design Scheduling helper` with a `helper.ini` beside it. The install then:

- registers `stella-open:` links for this user (`HKCU\Software\Classes\stella-open`);
- starts the hotkey at sign-in (`HKCU\...\CurrentVersion\Run`), shown by an icon in the tray.

The helper opens a folder only when it is really inside this PC's Stella Systems folder, after
junctions are followed. It hands the folder to File Explorer as one quoted argument, with no shell.
It never opens or runs a file; at most it shows one selected in its folder. Nothing goes over the
network.

To check a link without opening anything:

```
"%LOCALAPPDATA%\Stella\Design Scheduling helper\StellaHelper.exe" --check "stella-open:Some%20Folder"
```

The output is FOLDER or FILE and the full path, or REFUSED with the reason. It only appears when
the check is run from a console, since the program is built as a windowed app.
