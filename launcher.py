import os
import sys
import subprocess
import time
import webbrowser
import threading

# Reconfigure standard streams to UTF-8 to prevent UnicodeEncodeErrors on Windows
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def print_banner():
    banner = """
=========================================================
   _____         _     ___   ___  
  |_   _|___ ___| |_  |_  | |   | 
    | | | -_|  _|   |  |_ |_| | | 
    |_| |___|___|_|_| |___|_|___| 
=========================================================
      Aggregator, Filtering & AI Summarization
=========================================================
"""
    print(banner)

def load_env():
    env_vars = {}
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        env_vars[parts[0].strip()] = parts[1].strip()
    return env_vars

def save_env(env_vars):
    with open(".env", "w") as f:
        f.write("# Tech24 Configurations\n")
        for k, v in env_vars.items():
            f.write(f"{k}={v}\n")

def check_keys():
    env_vars = load_env()
    changed = False

    gemini_key = env_vars.get("GEMINI_API_KEY", "")
    if not gemini_key:
        print("[!] GEMINI_API_KEY is not set.")
        print("    You can get a free API key from Google AI Studio.")
        key_input = input("--> Enter your Gemini API Key (leave empty for offline fallback): ").strip()
        env_vars["GEMINI_API_KEY"] = key_input
        changed = True
        if key_input:
            print("[+] API Key saved to .env file.")
        else:
            print("[*] Running in local offline mode (fallback enabled).")

    if changed:
        save_env(env_vars)
        
    return env_vars

def run_npm_install():
    if not os.path.exists("node_modules"):
        print("[*] node_modules folder not found. Running npm install...")
        try:
            subprocess.run("npm install", shell=True, check=True)
            print("[+] npm install completed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"[-] npm install failed: {e}")
            input("Press Enter to exit...")
            sys.exit(1)

def run_npm_build():
    if not os.path.exists(".next"):
        print("[*] Production build not found. Running npm run build...")
        try:
            subprocess.run("npm run build", shell=True, check=True)
            print("[+] Build completed successfully.")
        except subprocess.CalledProcessError as e:
            print(f"[-] Build failed: {e}")
            input("Press Enter to exit...")
            sys.exit(1)

def main():
    print_banner()
    run_npm_install()
    env = check_keys()

    print("\nSelect execution mode:")
    print("1. Production Mode (Recommended - Built for speed)")
    print("2. Development Mode (For live changes and debugging)")
    mode = input("Select mode [1/2] (default: 1): ").strip()

    if mode == "2":
        cmd = "npm run dev"
        print("[*] Starting development server...")
    else:
        run_npm_build()
        cmd = "npm run start"
        print("[*] Starting production server...")

    # Start Next.js server as a background process
    server_process = subprocess.Popen(
        cmd,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        bufsize=1
    )

    # Thread to pipe stdout to console
    def log_pipe(proc):
        while True:
            line = proc.stdout.readline()
            if not line:
                break
            print(f"[Next.js] {line.strip()}")

    t = threading.Thread(target=log_pipe, args=(server_process,), daemon=True)
    t.start()

    # Wait 2 seconds before starting daemon so Next.js starts up
    time.sleep(2)
    print("[*] Starting background ingestion scheduler daemon...")
    daemon_process = subprocess.Popen(
        "node scripts/daemon.js",
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        bufsize=1
    )

    def log_daemon(proc):
        while True:
            line = proc.stdout.readline()
            if not line:
                break
            print(f"{line.strip()}")

    t_daemon = threading.Thread(target=log_daemon, args=(daemon_process,), daemon=True)
    t_daemon.start()

    # Wait 3 more seconds and launch browser
    time.sleep(3)
    print("\n[+] Server and Ingestion Daemon are running. Opening browser at http://localhost:3000")
    webbrowser.open("http://localhost:3000")

    print("\n=========================================================")
    print(" Tech24 server is active. Type 'exit' to stop the server.")
    print("=========================================================")
    
    while True:
        try:
            val = input().strip().lower()
            if val == "exit":
                break
        except KeyboardInterrupt:
            break

    print("[*] Shutting down Tech24 server and scheduler daemon...")
    # Terminate process tree on Windows
    if sys.platform == "win32":
        subprocess.run(f"taskkill /F /T /PID {server_process.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(f"taskkill /F /T /PID {daemon_process.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        server_process.terminate()
        daemon_process.terminate()
        
    print("[+] Tech24 server stopped. Goodbye!")

if __name__ == "__main__":
    main()
