import os
import shutil

import PyInstaller.__main__


def build_app():
    # 确保 dist 目录为空
    if os.path.exists("dist"):
        shutil.rmtree("dist")

    # PyInstaller 配置
    PyInstaller.__main__.run(
        [
            "desktop.py",  # 主程序文件
            "--name=个人知识库工具",  # 可执行文件名
            "--windowed",  # 无控制台窗口
            "--onefile",  # 打包成单个exe文件
            "--icon=static/e7.ico",  # 程序图标
            "--add-data=templates;templates",  # 添加模板目录
            "--add-data=static;static",  # 添加静态文件目录
            "--noconfirm",  # 覆盖输出目录
            "--clean",  # 清理临时文件
        ]
    )


if __name__ == "__main__":
    build_app()
