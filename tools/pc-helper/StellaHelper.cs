// StellaHelper.cs - Design Scheduling's helper on a PC (Phase 4, 2026-11-26).
//
// Two small things a browser cannot do on its own:
//
//   OPEN IN EXPLORER. The app's folder links are paths inside Stella Systems
//   ('Example Products/02 - Production/Job A'). A link's Open button asks the
//   browser for `stella-open:<the path, escaped>`, which Windows hands to this
//   program (install.ps1 registers it for this Windows user only).
//
//   THE CAPTURE HOTKEY. Ctrl+Alt+N (set in helper.ini) opens the app's New job
//   box in a small window, from anywhere: SolidWorks, AutoCAD, Outlook.
//
// ANY WEB PAGE CAN ASK FOR A stella-open: ADDRESS, so the address is treated
// as hostile. It is opened only when, after every step below, it is a folder
// (or a file, shown selected) that is really inside this PC's Stella Systems
// folder; and it goes to File Explorer as one quoted argument, with no shell
// in between, so nothing in it can run as a command. A file is never opened
// or run: only shown in its folder.
//
// No network, no data kept, nothing sent anywhere. Built on each PC by
// install.ps1 from this file (the C# compiler that comes with Windows), so no
// program file is handed around. Kept to C# 5, what that compiler reads.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32.SafeHandles;

public static class StellaHelper
{
    const string Scheme = "stella-open:";
    const string Title = "Design Scheduling";

    [STAThread]
    public static int Main(string[] args)
    {
        var cfg = Config.Load();
        if (args.Length >= 2 && args[0] == "--check")
        {
            // For the tests and for a person checking a PC: what would be opened, and nothing is.
            string why;
            Target t = Resolve(args[1], cfg.Root, out why);
            Console.WriteLine(t == null ? "REFUSED: " + why : (t.IsFile ? "FILE " : "FOLDER ") + t.Path);
            return t == null ? 1 : 0;
        }
        if (args.Length >= 1 && args[0] == "--hotkey") return Hotkey.Run(cfg);
        if (args.Length >= 1 && args[0].StartsWith(Scheme, StringComparison.OrdinalIgnoreCase))
        {
            string why;
            Target t = Resolve(args[0], cfg.Root, out why);
            if (t == null) { Say(why); return 1; }
            Explore(t);
            return 0;
        }
        Say("This is Design Scheduling's helper. It opens folder links from the app in File Explorer, and Ctrl+Alt+N adds a job. Nothing to do here.");
        return 0;
    }

    static void Say(string text)
    {
        MessageBox.Show(text, Title, MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    public class Target { public string Path; public bool IsFile; }

    /// <summary>
    /// The folder or file a stella-open: address names, or null with the reason.
    /// </summary>
    public static Target Resolve(string address, string root, out string why)
    {
        why = null;
        if (string.IsNullOrEmpty(root) || !Directory.Exists(root))
        {
            why = "Stella Systems was not found on this PC. Run the helper's Install again.";
            return null;
        }
        if (address == null || !address.StartsWith(Scheme, StringComparison.OrdinalIgnoreCase) || address.Length > 2000)
        {
            why = "That is not a Design Scheduling folder link.";
            return null;
        }
        string rest = address.Substring(Scheme.Length).Trim('/');
        string rel;
        try { rel = Uri.UnescapeDataString(rest); }
        catch { why = "That folder link is damaged."; return null; }

        // Anything that is not plainly a path below Stella Systems is refused:
        // drive letters, network paths, device names, wildcards, quotes,
        // control characters, and any "." or ".." step.
        foreach (char c in rel)
        {
            if (c < 32 || "\"<>|?*:".IndexOf(c) >= 0)
            {
                why = "That folder link has a character a folder name cannot have.";
                return null;
            }
        }
        string[] steps = rel.Replace('\\', '/').Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (steps.Length == 0) { why = "That folder link names no folder."; return null; }
        foreach (string s in steps)
        {
            if (s == "." || s == ".." || s.Trim().Length == 0 || s.EndsWith(".") || s.EndsWith(" "))
            {
                why = "That folder link does not name a folder inside Stella Systems.";
                return null;
            }
        }

        string top = System.IO.Path.GetFullPath(root).TrimEnd('\\');
        string full;
        try { full = System.IO.Path.GetFullPath(System.IO.Path.Combine(top, string.Join("\\", steps))); }
        catch { why = "That folder link does not name a folder inside Stella Systems."; return null; }
        if (!full.StartsWith(top + "\\", StringComparison.OrdinalIgnoreCase))
        {
            why = "That folder is not inside Stella Systems, so it was not opened.";
            return null;
        }
        bool isDir = Directory.Exists(full);
        bool isFile = !isDir && File.Exists(full);
        if (!isDir && !isFile)
        {
            why = "That folder is not on this PC. It may have been moved or renamed, or not be synced here yet.";
            return null;
        }
        // A junction or link inside Stella Systems could lead out of it: where
        // it really ends up must still be inside.
        string realTop = FinalPath(top, true);
        string realFull = FinalPath(full, isDir);
        if (realTop == null || realFull == null || !(realFull + "\\").StartsWith(realTop + "\\", StringComparison.OrdinalIgnoreCase))
        {
            why = "That folder leads out of Stella Systems, so it was not opened.";
            return null;
        }
        return new Target { Path = full, IsFile = isFile };
    }

    /// <summary>File Explorer, given the path as one quoted argument. No shell.</summary>
    static void Explore(Target t)
    {
        string explorer = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
        var psi = new ProcessStartInfo(explorer, (t.IsFile ? "/select,\"" : "\"") + t.Path + "\"");
        psi.UseShellExecute = false;
        Process.Start(psi);
    }

    // ---- where a path really leads (junctions and links resolved) ----------

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sec, uint disposition, uint flags, IntPtr template);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern uint GetFinalPathNameByHandleW(SafeFileHandle h, StringBuilder buf, uint size, uint flags);

    static string FinalPath(string path, bool dir)
    {
        const uint FILE_READ_ATTRIBUTES = 0x80, SHARE_ALL = 7, OPEN_EXISTING = 3, BACKUP_SEMANTICS = 0x02000000;
        using (SafeFileHandle h = CreateFileW(path, FILE_READ_ATTRIBUTES, SHARE_ALL, IntPtr.Zero, OPEN_EXISTING, dir ? BACKUP_SEMANTICS : 0, IntPtr.Zero))
        {
            if (h.IsInvalid) return null;
            var sb = new StringBuilder(1024);
            uint n = GetFinalPathNameByHandleW(h, sb, (uint)sb.Capacity, 0);
            if (n == 0 || n >= sb.Capacity) return null;
            string s = sb.ToString();
            if (s.StartsWith(@"\\?\UNC\")) s = @"\\" + s.Substring(8);
            else if (s.StartsWith(@"\\?\")) s = s.Substring(4);
            return s.TrimEnd('\\');
        }
    }

    // ---- helper.ini, beside the program ------------------------------------

    public class Config
    {
        public string Root = "";
        public string Url = "https://stellamarinedesign.github.io/design-scheduling/";
        public string Browser = "";
        public string Hotkey = "Ctrl+Alt+N";

        public static Config Load()
        {
            var c = new Config();
            string file = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "helper.ini");
            if (!File.Exists(file)) return c;
            foreach (string line in File.ReadAllLines(file, Encoding.UTF8))
            {
                int at = line.IndexOf('=');
                if (at <= 0 || line.TrimStart().StartsWith("#")) continue;
                string k = line.Substring(0, at).Trim().ToLowerInvariant();
                string v = line.Substring(at + 1).Trim();
                if (k == "root") c.Root = v;
                else if (k == "url" && v.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) c.Url = v;
                else if (k == "browser") c.Browser = v;
                else if (k == "hotkey") c.Hotkey = v;
            }
            return c;
        }
    }

    // ---- the capture hotkey ------------------------------------------------

    static class Hotkey
    {
        [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
        [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        const int WM_HOTKEY = 0x0312;
        const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_WIN = 8, MOD_NOREPEAT = 0x4000;

        class Sink : NativeWindow, IDisposable
        {
            public Action Pressed;
            public Sink() { CreateHandle(new CreateParams()); }
            protected override void WndProc(ref Message m)
            {
                if (m.Msg == WM_HOTKEY && Pressed != null) Pressed();
                base.WndProc(ref m);
            }
            public void Dispose() { DestroyHandle(); }
        }

        public static int Run(Config cfg)
        {
            bool first;
            using (var one = new Mutex(true, @"Local\StellaDesignSchedulingHotkey", out first))
            {
                if (!first) return 0;          // already running for this Windows user
                uint mods, vk;
                if (!Parse(cfg.Hotkey, out mods, out vk)) { Say("The hotkey in helper.ini (" + cfg.Hotkey + ") is not one Windows knows. Run the helper's Install again."); return 1; }
                using (var sink = new Sink())
                using (var tray = new NotifyIcon())
                {
                    if (!RegisterHotKey(sink.Handle, 1, mods | MOD_NOREPEAT, vk))
                    {
                        Say(cfg.Hotkey + " is already used by another program, so Design Scheduling's hotkey is off. Choose another in helper.ini (the helper's Install asks), then sign out and in again.");
                        return 1;
                    }
                    sink.Pressed = () => Capture(cfg);
                    tray.Icon = SystemIcons.Application;
                    tray.Text = "Design Scheduling: " + cfg.Hotkey + " adds a job";
                    var menu = new ContextMenu();
                    menu.MenuItems.Add("Add a job (" + cfg.Hotkey + ")", (s, e) => Capture(cfg));
                    menu.MenuItems.Add("Turn the hotkey off until next sign-in", (s, e) => Application.Exit());
                    tray.ContextMenu = menu;
                    tray.DoubleClick += (s, e) => Capture(cfg);
                    tray.Visible = true;
                    Application.Run();
                    tray.Visible = false;
                    UnregisterHotKey(sink.Handle, 1);
                }
            }
            return 0;
        }

        /// <summary>The app's New job box, in a small window of its own.</summary>
        static void Capture(Config cfg)
        {
            string url = cfg.Url.TrimEnd('/') + "/?capture=1&close=1#/home";
            try
            {
                if (cfg.Browser.Length > 0 && File.Exists(cfg.Browser))
                {
                    var psi = new ProcessStartInfo(cfg.Browser, "--app=\"" + url + "\" --window-size=560,640");
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                }
                else Process.Start(url);
            }
            catch (Exception e) { Say("The browser did not open: " + e.Message); }
        }

        static bool Parse(string text, out uint mods, out uint vk)
        {
            mods = 0; vk = 0;
            foreach (string raw in (text ?? "").Split('+'))
            {
                string p = raw.Trim().ToLowerInvariant();
                if (p == "ctrl" || p == "control") mods |= MOD_CONTROL;
                else if (p == "alt") mods |= MOD_ALT;
                else if (p == "shift") mods |= MOD_SHIFT;
                else if (p == "win") mods |= MOD_WIN;
                else if (p.Length == 1 && char.IsLetterOrDigit(p[0])) vk = (uint)char.ToUpperInvariant(p[0]);
                else if (p.Length >= 2 && p[0] == 'f')
                {
                    int n;
                    if (int.TryParse(p.Substring(1), out n) && n >= 1 && n <= 24) vk = (uint)(0x70 + n - 1);
                    else return false;
                }
                else return false;
            }
            return vk != 0 && mods != 0;
        }
    }
}
