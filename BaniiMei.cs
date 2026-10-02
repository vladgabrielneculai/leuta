using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BaniiMei
{
    static class Program
    {
        private static Mutex singleInstanceMutex = null;
        private static Process serverProcess = null;
        private static NotifyIcon trayIcon = null;
        private static string baseDir = "";
        private static MainWindow mainWindow = null;

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        private const int SW_RESTORE = 9;
        public const string WindowTitle = "Banii mei - Aplicație financiară";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            singleInstanceMutex = new Mutex(true, "BaniiMeiDesktopAppMutex", out createdNew);
            baseDir = AppDomain.CurrentDomain.BaseDirectory;

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

            // Asigură oprirea serverului la ieșire
            AppDomain.CurrentDomain.ProcessExit += (s, e) => StopServer();
            Application.ApplicationExit += (s, e) => StopServer();

            // Inițializare System Tray
            SetupTray();

            // Pornire server dacă este necesar
            if (!IsServerRunning())
            {
                StartServer();
            }

            // Lansare fereastră nativă principală
            mainWindow = new MainWindow(baseDir);
            Application.Run(mainWindow);
        }

        public static bool IsServerRunning()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://localhost:3100/api/auth/status");
                request.Timeout = 600;
                request.Method = "GET";
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void StartServer()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "cmd.exe";
                psi.Arguments = "/c npm run start";
                psi.WorkingDirectory = baseDir;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.UseShellExecute = false;

                serverProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Eroare la pornirea serverului local: " + ex.Message, "Banii mei", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void SetupTray()
        {
            trayIcon = new NotifyIcon();
            trayIcon.Text = WindowTitle;

            string icoPath = Path.Combine(baseDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { trayIcon.Icon = new Icon(icoPath); } catch { trayIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("Deschide aplicația", (s, e) =>
            {
                if (mainWindow != null)
                {
                    mainWindow.RestoreAndBringToFront();
                }
            });
            menu.MenuItems.Add("Reîncarcă fereastra", (s, e) =>
            {
                if (mainWindow != null)
                {
                    mainWindow.ReloadPage();
                }
            });
            menu.MenuItems.Add("Deschide folderul bazei de date", (s, e) =>
            {
                string dataDir = Path.Combine(baseDir, "data");
                if (Directory.Exists(dataDir)) Process.Start("explorer.exe", dataDir);
            });
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("Ieșire", (s, e) =>
            {
                StopServer();
                trayIcon.Visible = false;
                Application.Exit();
            });

            trayIcon.ContextMenu = menu;
            trayIcon.DoubleClick += (s, e) =>
            {
                if (mainWindow != null)
                {
                    mainWindow.RestoreAndBringToFront();
                }
            };
            trayIcon.Visible = true;
        }

        public static void StopServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    ProcessStartInfo killPsi = new ProcessStartInfo();
                    killPsi.FileName = "taskkill";
                    killPsi.Arguments = string.Format("/F /T /PID {0}", serverProcess.Id);
                    killPsi.CreateNoWindow = true;
                    killPsi.WindowStyle = ProcessWindowStyle.Hidden;
                    killPsi.UseShellExecute = false;
                    Process killProc = Process.Start(killPsi);
                    if (killProc != null) killProc.WaitForExit(3000);
                }
                catch { }
            }
        }
    }

    public class MainWindow : Form
    {
        private WebView2 webView;
        private string appBaseDir;
        private System.Windows.Forms.Timer fadeTimer;
        private System.Windows.Forms.Timer serverCheckTimer;
        private bool isAppLoaded = false;
        private int serverAttempts = 0;
        private DateTime splashStartTime;
        private const double MinSplashSeconds = 3.8;

        public MainWindow(string baseDir)
        {
            this.appBaseDir = baseDir;
            InitializeComponent();
        }

        private void InitializeComponent()
        {
            this.Text = Program.WindowTitle;
            this.Size = new Size(1380, 880);
            this.MinimumSize = new Size(1000, 650);
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
                if (this.Opacity < 1.0)
                {
                    this.Opacity += 0.07;
                }
                else
                {
                    this.Opacity = 1.0;
                    fadeTimer.Stop();
                }
            };

            // Inițializare control WebView2 nativ
            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            this.Controls.Add(webView);

            this.Load += MainWindow_Load;
            this.FormClosing += MainWindow_FormClosing;
        }

        private async void MainWindow_Load(object sender, EventArgs e)
        {
            splashStartTime = DateTime.Now;
            fadeTimer.Start();

            try
            {
                string profileDir = Path.Combine(appBaseDir, "data", "webview-profile");
                if (!Directory.Exists(profileDir)) Directory.CreateDirectory(profileDir);

                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, profileDir, null);
                await webView.EnsureCoreWebView2Async(env);

                // Setări native pentru o experiență de desktop curată
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.Settings.IsZoomControlEnabled = true;

                // Dezactivează complet pop-up-urile implicite de browser (alert/confirm/prompt de Edge)
                webView.CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = false;

                // Afișează ecranul nativ de pornire (Splash Screen animat)
                webView.CoreWebView2.NavigateToString(GetSplashHtml());

                // Timer pentru verificarea pornirii serverului local
                serverCheckTimer = new System.Windows.Forms.Timer();
                serverCheckTimer.Interval = 250;
                serverCheckTimer.Tick += ServerCheckTimer_Tick;
                serverCheckTimer.Start();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Eroare la inițializarea componentei native: " + ex.Message, "Banii mei", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ServerCheckTimer_Tick(object sender, EventArgs e)
        {
            serverAttempts++;
            double elapsed = (DateTime.Now - splashStartTime).TotalSeconds;

            // Asigură că animația durează cel puțin 3.8 secunde înainte de afișarea interfeței
            if (elapsed >= MinSplashSeconds && Program.IsServerRunning())
            {
                serverCheckTimer.Stop();
                if (!isAppLoaded)
                {
                    isAppLoaded = true;
                    webView.CoreWebView2.Navigate("http://localhost:3100");
                }
                return;
            }

            // Dacă după 30 secunde nu răspunde, afișează eroare
            if (serverAttempts > 120)
            {
                serverCheckTimer.Stop();
                MessageBox.Show("Serverul local nu a răspuns la timp. Verifică instalarea Node.js.", "Banii mei", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        public void RestoreAndBringToFront()
        {
            if (this.WindowState == FormWindowState.Minimized)
            {
                this.WindowState = FormWindowState.Normal;
            }
            this.Show();
            this.BringToFront();
            this.Activate();
        }

        public void ReloadPage()
        {
            if (webView != null && webView.CoreWebView2 != null)
            {
                webView.CoreWebView2.Reload();
            }
        }

        private void MainWindow_FormClosing(object sender, FormClosingEventArgs e)
        {
            // Oprește complet serverul și eliberează resursele
            Program.StopServer();
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
            Ediție Windows Nativă • Date securizate local pe acest calculator
        </div>
    </div>

    <script>
        (function() {
            var totalDuration = 3800; // 3.8 secunde
            var startTime = performance.now();
            var fill = document.getElementById('progress-fill');
            var percentText = document.getElementById('percent-text');
            var statusLabel = document.getElementById('status-label');

            var steps = [
                { limit: 25, text: 'Inițializare subsistem Windows & securitate…' },
                { limit: 55, text: 'Verificare bază de date SQLite & setări locale…' },
                { limit: 85, text: 'Sincronizare curs valutar BNR & inflație România…' },
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
