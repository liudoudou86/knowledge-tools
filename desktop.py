import threading
import time

import webview

from app import app


def run_flask():
    """运行Flask应用"""
    app.run(debug=False, port=5000, threaded=True)


if __name__ == "__main__":
    # 在后台线程中启动Flask
    t = threading.Thread(target=run_flask)
    t.daemon = True
    t.start()

    # 等待Flask服务启动
    time.sleep(1)

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

    webview.start()
