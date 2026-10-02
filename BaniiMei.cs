using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Banii mei — fereastră desktop pentru versiunea ONLINE a aplicației.
//
// Înainte, executabilul pornea local un server Node.js (npm run start) și cerea Node instalat.
// Acum aplicația rulează pe Vercel + Supabase, așa că fereastra doar deschide adresa online:
// nu mai e nevoie de Node, npm install sau npm run dev. Adresa se citește din
// „BaniiMei.url.txt” (lângă exe), ca să poată fi schimbată fără recompilare.
// Cod compatibil C# 5, ca să se poată compila și cu csc.exe din .NET Framework (build-exe.ps1).

namespace BaniiMei
{
    static class Program
    {
        public const string DefaultUrl = "https://buget-personal.vercel.app";
        public const string WindowTitle = "Banii mei - Aplicație financiară";

        private static Mutex singleInstanceMutex = null;
        private static NotifyIcon trayIcon = null;
        private static MainWindow mainWindow = null;
        public static string BaseDir = "";
        public static string AppUrl = DefaultUrl;

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        private const int SW_RESTORE = 9;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            singleInstanceMutex = new Mutex(true, "BaniiMeiDesktopAppMutex", out createdNew);
            BaseDir = AppDomain.CurrentDomain.BaseDirectory;

            if (!createdNew)
            {
                // Adu instanța deja existentă în prim-plan
                IntPtr hWnd = FindWindow(null, WindowTitle);
                if (hWnd != IntPtr.Zero)
                {
                    ShowWindowAsync(hWnd, SW_RESTORE);
                    SetForegroundWindow(hWnd);
                }
                return;
            }

            AppUrl = ReadUrl();
            SetupTray();
            mainWindow = new MainWindow(BaseDir);
            Application.ApplicationExit += (s, e) => { if (trayIcon != null) trayIcon.Visible = false; };
            Application.Run(mainWindow);
        }

        /// Prima linie ne-goală din BaniiMei.url.txt, altfel adresa implicită.
        private static string ReadUrl()
        {
            try
            {
                string path = Path.Combine(BaseDir, "BaniiMei.url.txt");
                if (File.Exists(path))
                {
                    foreach (string line in File.ReadAllLines(path))
                    {
                        string t = line.Trim();
                        if (t.StartsWith("http://") || t.StartsWith("https://")) return t.TrimEnd('/');
                    }
                }
            }
            catch { }
            return DefaultUrl;
        }

        private static void SetupTray()
        {
            trayIcon = new NotifyIcon();
            trayIcon.Text = WindowTitle;

            string icoPath = Path.Combine(BaseDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { trayIcon.Icon = new Icon(icoPath); } catch { trayIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Deschide aplicația", (s, e) => { if (mainWindow != null) mainWindow.RestoreAndBringToFront(); });
            menu.MenuItems.Add("Reîncarcă fereastra", (s, e) => { if (mainWindow != null) mainWindow.ReloadPage(); });
            menu.MenuItems.Add("Deschide în browser", (s, e) => { try { Process.Start(AppUrl); } catch { } });
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Ieșire", (s, e) =>
            {
                trayIcon.Visible = false;
                Application.Exit();
            });

            trayIcon.ContextMenu = menu;
            trayIcon.DoubleClick += (s, e) => { if (mainWindow != null) mainWindow.RestoreAndBringToFront(); };
            trayIcon.Visible = true;
        }
    }

    public class MainWindow : Form
    {
        private WebView2 webView;
        private string appBaseDir;
        private System.Windows.Forms.Timer fadeTimer;
        private System.Windows.Forms.Timer splashTimer;
        private bool isAppLoaded = false;

        public MainWindow(string baseDir)
        {
            this.appBaseDir = baseDir;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = Program.WindowTitle;
            this.Size = new Size(1380, 880);
            this.MinimumSize = new Size(420, 650);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = ColorTranslator.FromHtml("#EDF1EE");

            string icoPath = Path.Combine(appBaseDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); } catch { }
            }

            // Animație fină de deschidere (fade-in)
            this.Opacity = 0.0;
            fadeTimer = new System.Windows.Forms.Timer();
            fadeTimer.Interval = 15;
            fadeTimer.Tick += (s, e) =>
            {
                if (this.Opacity < 1.0) this.Opacity += 0.07;
                else { this.Opacity = 1.0; fadeTimer.Stop(); }
            };

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            this.Controls.Add(webView);

            this.Load += MainWindow_Load;
        }

        private async void MainWindow_Load(object sender, EventArgs e)
        {
            fadeTimer.Start();
            try
            {
                // Profilul WebView (cookie-ul de login „ține-mă minte”) rămâne în %LOCALAPPDATA%,
                // ca să nu depindă de folderul în care stă exe-ul.
                string profileDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BaniiMei", "webview-profile");
                if (!Directory.Exists(profileDir)) Directory.CreateDirectory(profileDir);

                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, profileDir, null);
                await webView.EnsureCoreWebView2Async(env);

                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                // Linkurile spre alte site-uri se deschid în browserul implicit, nu în fereastra aplicației.
                webView.CoreWebView2.NewWindowRequested += (s, a) =>
                {
                    a.Handled = true;
                    try { Process.Start(a.Uri); } catch { }
                };
                webView.CoreWebView2.NavigationCompleted += (s, a) =>
                {
                    if (!a.IsSuccess && isAppLoaded)
                        webView.CoreWebView2.NavigateToString(GetOfflineHtml());
                };

                webView.CoreWebView2.NavigateToString(GetSplashHtml());

                // Splash scurt, apoi aplicația online
                splashTimer = new System.Windows.Forms.Timer();
                splashTimer.Interval = 1800;
                splashTimer.Tick += (s, a) =>
                {
                    splashTimer.Stop();
                    isAppLoaded = true;
                    webView.CoreWebView2.Navigate(Program.AppUrl);
                };
                splashTimer.Start();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Componenta WebView2 nu a putut porni: " + ex.Message + "\n\nAplicația se deschide în browser.", "Banii mei", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                try { Process.Start(Program.AppUrl); } catch { }
            }
        }

        public void RestoreAndBringToFront()
        {
            if (this.WindowState == FormWindowState.Minimized) this.WindowState = FormWindowState.Normal;
            this.Show();
            this.BringToFront();
            this.Activate();
        }

        public void ReloadPage()
        {
            if (webView != null && webView.CoreWebView2 != null)
            {
                if (webView.CoreWebView2.Source == null || !webView.CoreWebView2.Source.StartsWith("http"))
                    webView.CoreWebView2.Navigate(Program.AppUrl);
                else
                    webView.CoreWebView2.Reload();
            }
        }

        private string GetOfflineHtml()
        {
            return @"<!DOCTYPE html><html lang=""ro""><head><meta charset=""UTF-8""><title>Banii mei</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#EDF1EE;
font-family:'Segoe UI',sans-serif;color:#1C2B30}.c{background:#fff;border:1px solid #D5DDD8;border-radius:20px;padding:40px 44px;
max-width:440px;text-align:center;box-shadow:0 20px 50px -15px rgba(28,43,48,.15)}h1{font-size:22px;margin:0 0 8px}
p{color:#556B73;font-size:14px;line-height:1.5}a{display:inline-block;margin-top:14px;background:#2E5C8A;color:#fff;
padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600}</style></head><body><div class=""c"">
<h1>Nu există conexiune</h1><p>Aplicația rulează online și are nevoie de internet. Verifică conexiunea și încearcă din nou.</p>
<a href=""" + Program.AppUrl + @""">Reîncearcă</a></div></body></html>";
        }

        private string GetSplashHtml()
        {
            return @"<!DOCTYPE html>
<html lang=""ro"">
<head>
    <meta charset=""UTF-8"">
    <title>Banii mei</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: radial-gradient(circle at 50% 30%, #F4F7F5 0%, #E2EAE5 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #1C2B30;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            user-select: none;
            overflow: hidden;
        }
        .splash-card {
            background: rgba(255, 255, 255, 0.94);
            border: 1px solid rgba(213, 221, 216, 0.85);
            backdrop-filter: blur(16px);
            border-radius: 24px;
            padding: 48px 52px;
            width: 480px;
            max-width: 92vw;
            box-shadow: 0 24px 60px -15px rgba(28, 43, 48, 0.16), 0 0 0 1px rgba(255, 255, 255, 0.6) inset;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: cardAppear 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
            position: relative;
        }
        @keyframes cardAppear {
            from { opacity: 0; transform: translateY(16px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .logo-box {
            width: 76px;
            height: 76px;
            background: linear-gradient(135deg, #E6F3E9 0%, #CCE5D2 100%);
            border: 1px solid #B8D6C0;
            border-radius: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 10px 28px -6px rgba(61, 122, 78, 0.35);
            margin-bottom: 22px;
            animation: pulseGlow 2.8s infinite ease-in-out;
            position: relative;
        }
        @keyframes pulseGlow {
            0%, 100% { transform: scale(1); box-shadow: 0 10px 28px -6px rgba(61, 122, 78, 0.3); }
            50% { transform: scale(1.04); box-shadow: 0 14px 36px -4px rgba(61, 122, 78, 0.5); }
        }
        .logo-letter {
            font-size: 36px;
            font-weight: 800;
            color: #2F693E;
            letter-spacing: -0.02em;
        }
        .title {
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.025em;
            color: #1C2B30;
            margin-bottom: 4px;
        }
        .subtitle {
            font-size: 13.5px;
            color: #556B73;
            margin-bottom: 20px;
            font-weight: 500;
        }
        .stripes {
            display: flex;
            gap: 6px;
            margin-bottom: 26px;
        }
        .stripe {
            height: 4.5px;
            width: 28px;
            border-radius: 999px;
            transition: transform 0.3s ease;
        }
        .progress-section {
            width: 100%;
            margin-top: 4px;
            margin-bottom: 18px;
        }
        .progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: 600;
            color: #72848B;
        }
        .progress-percent {
            color: #3D7A4E;
            font-variant-numeric: tabular-nums;
        }
        .progress-bar-container {
            width: 100%;
            height: 7px;
            background: #E2E8E4;
            border-radius: 9999px;
            overflow: hidden;
            position: relative;
        }
        .progress-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #3D7A4E 0%, #2E5C8A 100%);
            border-radius: 9999px;
            transition: width 0.1s linear;
        }
        .status-box {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-height: 22px;
        }
        .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #3D7A4E;
            box-shadow: 0 0 8px #3D7A4E;
            animation: blink 1.2s infinite ease-in-out;
        }
        @keyframes blink {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.3; transform: scale(0.8); }
        }
        .status-text {
            font-size: 13px;
            color: #4A5B61;
            font-weight: 500;
            transition: opacity 0.25s ease;
        }
        .footer-note {
            margin-top: 24px;
            font-size: 11px;
            color: #8D9FA6;
            letter-spacing: 0.02em;
        }
    </style>
</head>
<body>
    <div class=""splash-card"">
        <div class=""logo-box"">
            <span class=""logo-letter"">B</span>
        </div>
        <div class=""title"">Banii mei</div>
        <div class=""subtitle"">Aplicație desktop Windows • Buget Personal</div>
        <div class=""stripes"">
            <span class=""stripe"" style=""background: #3D7A4E;""></span>
            <span class=""stripe"" style=""background: #6A4E99;""></span>
            <span class=""stripe"" style=""background: #B5456A;""></span>
            <span class=""stripe"" style=""background: #C99A1E;""></span>
            <span class=""stripe"" style=""background: #2E5C8A;""></span>
        </div>
        
        <div class=""progress-section"">
            <div class=""progress-header"">
                <span>Stare inițializare</span>
                <span id=""percent-text"" class=""progress-percent"">0%</span>
            </div>
            <div class=""progress-bar-container"">
                <div id=""progress-fill"" class=""progress-bar-fill""></div>
            </div>
        </div>

        <div class=""status-box"">
            <span class=""status-dot""></span>
            <span id=""status-label"" class=""status-text"">Se pornește nucleul aplicației…</span>
        </div>

        <div class=""footer-note"">
            Ediție Windows • Datele tale, sincronizate online
        </div>
    </div>

    <script>
        (function() {
            var totalDuration = 1800; // 1.8 secunde
            var startTime = performance.now();
            var fill = document.getElementById('progress-fill');
            var percentText = document.getElementById('percent-text');
            var statusLabel = document.getElementById('status-label');

            var steps = [
                { limit: 30, text: 'Conectare la serverul aplicației…' },
                { limit: 60, text: 'Încărcare date din cloud (Supabase)…' },
                { limit: 90, text: 'Sincronizare curs valutar BNR & inflație România…' },
                { limit: 100, text: 'Spațiul financiar este pregătit. Bun venit!' }
            ];

            function tick(now) {
                var elapsed = now - startTime;
                var progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));
                
                fill.style.width = progress + '%';
                percentText.textContent = progress + '%';

                for (var i = 0; i < steps.length; i++) {
                    if (progress <= steps[i].limit) {
                        if (statusLabel.textContent !== steps[i].text) {
                            statusLabel.textContent = steps[i].text;
                        }
                        break;
                    }
                }

                if (elapsed < totalDuration) {
                    requestAnimationFrame(tick);
                } else {
                    fill.style.width = '100%';
                    percentText.textContent = '100%';
                    statusLabel.textContent = 'Spațiul financiar este pregătit. Bun venit!';
                }
            }

            requestAnimationFrame(tick);
        })();
    </script>
</body>
</html>";
        }
    }
}
