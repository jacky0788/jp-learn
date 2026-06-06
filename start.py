#!/usr/bin/env python3
"""日文複習 啟動器（跨平台）

做四件事：
  1. 偵測 Python 版本
  2. 自動安裝缺少的套件（PyYAML 必要、qrcode 選用）
  3. 從 data/lessons/*.yaml 產生複習資料（web/data.js、Anki 匯出檔）
  4. 啟動本機網站；電腦與「同一個 Wi-Fi 的手機／平板」都能開

用法：
  python start.py                # 啟動（預設埠 5599，並自動開瀏覽器）
  python start.py --port 8000    # 指定埠號
  python start.py --no-browser   # 不自動開瀏覽器
"""
import sys
import os
import subprocess
import socket
import webbrowser
import functools
import http.server

# 讓輸出在任何系統（含 Windows cp950 主控台）都不會因為 emoji/中文而崩潰
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT, "web")
DEFAULT_PORT = 5599


def ensure_package(pip_name, import_name=None, required=True):
    """確認套件存在，缺少就用 pip 安裝。回傳是否可用。"""
    import_name = import_name or pip_name
    try:
        __import__(import_name)
        return True
    except ImportError:
        print(f"  缺少套件 {pip_name}，正在安裝……")
        for extra in ([], ["--user"]):
            try:
                subprocess.check_call(
                    [sys.executable, "-m", "pip", "install", "--quiet", pip_name] + extra)
                __import__(import_name)
                print(f"  ✓ {pip_name} 已安裝")
                return True
            except Exception:
                continue
        msg = "（必要）" if required else "（選用，可略過）"
        print(f"  ✗ {pip_name} 安裝失敗{msg}　手動安裝：pip install {pip_name}")
        return False


def lan_ip():
    """取得這台電腦在區網的 IP（手機連線用）。"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, *args):
        pass  # 安靜，不要洗版


def main():
    args = sys.argv[1:]
    port = DEFAULT_PORT
    if "--port" in args:
        try:
            port = int(args[args.index("--port") + 1])
        except (ValueError, IndexError):
            pass
    open_browser = "--no-browser" not in args

    print("=" * 46)
    print("  日文複習　啟動器")
    print("=" * 46)

    # 1. Python 版本
    print(f"Python {sys.version.split()[0]}")
    if sys.version_info < (3, 8):
        print("需要 Python 3.8 以上，請更新後再試。")
        sys.exit(1)

    # 2. 套件
    print("檢查套件……")
    if not ensure_package("pyyaml", "yaml", required=True):
        print("\nPyYAML 是必要套件，無法繼續。請先執行：pip install pyyaml")
        sys.exit(1)
    has_qr = ensure_package("qrcode", "qrcode", required=False)

    # 3. 產生資料
    print("產生複習資料……")
    try:
        env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
        subprocess.check_call([sys.executable, os.path.join(ROOT, "scripts", "build.py")], env=env)
    except Exception as e:
        print(f"建置失敗：{e}")
        sys.exit(1)

    # 4. 啟動伺服器
    ip = lan_ip()
    handler = functools.partial(NoCacheHandler, directory=WEB_DIR)
    try:
        httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), handler)
    except OSError as e:
        print(f"\n埠號 {port} 可能已被占用：{e}")
        print(f"請改用其他埠：python start.py --port 8080")
        sys.exit(1)

    local_url = f"http://localhost:{port}/"
    lan_url = f"http://{ip}:{port}/"

    print("=" * 46)
    print("  ✅ 已啟動！按 Ctrl+C 結束。")
    print("=" * 46)
    print(f"  這台電腦：       {local_url}")
    print(f"  手機／平板：     {lan_url}")
    print("  （手機要連到「同一個 Wi-Fi」，第一次 Windows 可能跳出防火牆提示，請按「允許」）")

    if has_qr:
        try:
            import qrcode
            qr = qrcode.QRCode(border=1)
            qr.add_data(lan_url)
            qr.make()
            print("\n  用手機相機掃描以下 QR code 直接開啟：\n")
            qr.print_ascii(invert=True)
        except Exception:
            pass

    if open_browser:
        try:
            webbrowser.open(local_url)
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已結束，再見！")
        httpd.shutdown()


if __name__ == "__main__":
    main()
