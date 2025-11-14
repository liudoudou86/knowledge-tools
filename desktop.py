import os
import threading
import time

import pystray
import requests
import webview
from PIL import Image, ImageDraw

from app import app

# 全局变量
window = None
tray_icon = None


def create_tray_icon():
    """创建系统托盘图标"""
    # 尝试使用现有的图标文件
    icon_path = os.path.join(os.path.dirname(__file__), "static", "e7.ico")

    if os.path.exists(icon_path):
        try:
            # 使用现有的ICO文件
            image = Image.open(icon_path)
            # 调整大小为合适的托盘图标尺寸
            image = image.resize((64, 64), Image.Resampling.LANCZOS)
            return image
        except Exception as e:
            print(f"加载图标文件失败: {e}")

    # 如果图标文件不存在或加载失败，创建一个简单的图标
    image = Image.new("RGB", (64, 64), color="#2c3e50")
    draw = ImageDraw.Draw(image)

    # 绘制一个更美观的图标
    draw.ellipse([8, 8, 56, 56], fill="#3498db", outline="#2980b9", width=2)
    draw.text((32, 32), "K", fill="white", font=None, anchor="mm")

    return image


def show_window(icon, item):
    """显示主窗口"""
    global window
    if window:
        window.show()
        window.maximize()


def hide_window(icon, item):
    """隐藏窗口到托盘"""
    global window
    if window:
        window.hide()


def exit_app(icon, item):
    """退出应用程序"""
    global window, tray_icon

    print("正在关闭应用程序...")

    # 1. 首先关闭托盘图标
    if tray_icon:
        try:
            tray_icon.stop()
            print("托盘图标已关闭")
        except Exception as e:
            print(f"关闭托盘图标时出错: {e}")

    # 2. 关闭WebView窗口
    if window:
        try:
            window.destroy()
            print("WebView窗口已关闭")
        except Exception as e:
            print(f"关闭WebView窗口时出错: {e}")

    # 3. 强制退出（不等待Flask线程）
    print("应用程序关闭完成")
    os._exit(0)


def on_window_closing():
    """窗口关闭事件处理"""
    global window
    if window:
        window.hide()
        return False  # 阻止窗口真正关闭


def run_flask():
    """运行Flask应用"""
    app.run(debug=False, port=5000, threaded=True)


def wait_for_flask_ready(max_wait=15):
    """智能等待Flask服务就绪"""
    start_time = time.time()
    check_count = 0
    while time.time() - start_time < max_wait:
        try:
            response = requests.get("http://127.0.0.1:5000/api/health", timeout=1)
            if response.status_code == 200:
                print(f"Flask服务已就绪 (耗时: {time.time() - start_time:.1f}秒)")
                return True
        except:
            check_count += 1
            # 前几次检查间隔短一些，后面逐渐增加
            if check_count < 3:
                time.sleep(0.2)
            elif check_count < 6:
                time.sleep(0.5)
            else:
                time.sleep(1)
    print("Flask服务启动超时")
    return False


def start_tray_icon():
    """启动系统托盘图标"""
    global tray_icon
    # 创建托盘菜单
    menu = pystray.Menu(
        pystray.MenuItem(
            "显示窗口", show_window, default=True
        ),  # 设置为默认动作，双击时会触发
        pystray.MenuItem("退出", exit_app),
    )

    # 创建托盘图标
    tray_icon = pystray.Icon(
        "个人知识库工具", create_tray_icon(), "个人知识库工具", menu
    )

    # 启动托盘图标
    tray_icon.run()


if __name__ == "__main__":
    # 在后台线程中启动Flask
    t = threading.Thread(target=run_flask)
    t.daemon = True
    t.start()

    # 智能等待Flask服务启动
    if wait_for_flask_ready():
        # 创建PyWebView窗口
        window = webview.create_window(
            "个人知识库工具",
            "http://127.0.0.1:5000",
            maximized=True,
            resizable=True,
            min_size=(1024, 768),
            text_select=True,
            zoomable=True,
            frameless=False,
        )

        # 设置窗口关闭事件处理
        window.events.closing += on_window_closing

        # 在后台线程中启动托盘图标
        tray_thread = threading.Thread(target=start_tray_icon)
        tray_thread.daemon = True
        tray_thread.start()

        # 启动webview
        webview.start()
    else:
        print("应用启动失败：Flask服务未能在指定时间内启动")
