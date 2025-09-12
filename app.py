import datetime
import os
import sqlite3
import sys
from contextlib import contextmanager

from flask import Flask, jsonify, render_template, request
from flask_cors import CORS


# ---------- 工具函数 ----------
def resource_path(relative_path):
    """取资源绝对路径（兼容 PyInstaller）"""
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)


def base_dir():
    """取当前 exe 所在目录（开发时取脚本目录）"""
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


DB_PATH = os.path.join(base_dir(), "knowledge.db")  # 数据库放 exe 同目录


# ---------- 数据库连接 ----------
@contextmanager
def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ---------- Flask ----------
app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static"),
)
CORS(app)


# ---------- 初始化表 ----------
def init_db():
    new_db = not os.path.exists(DB_PATH)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS knowledge (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT,
                tags TEXT,
                created_date TEXT NOT NULL,
                last_modified TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                completed BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    return new_db


with app.app_context():
    print("Created new database" if init_db() else "Using existing database")


# ---------- 知识库 API ----------
@app.route("/api/knowledge", methods=["GET"])
def get_all_knowledge():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            category = request.args.get("category")
            if category:
                cursor.execute(
                    "SELECT * FROM knowledge WHERE category = ? ORDER BY last_modified DESC",
                    (category,),
                )
            else:
                cursor.execute("SELECT * FROM knowledge ORDER BY last_modified DESC")
            return jsonify([dict(row) for row in cursor.fetchall()])
    except Exception as e:
        print("Error fetching knowledge:", e)
        return jsonify({"error": "Failed to fetch knowledge"}), 500


@app.route("/api/knowledge/search", methods=["GET"])
def search_knowledge():
    keyword = request.args.get("keyword")
    if not keyword:
        return jsonify([])
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM knowledge WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? ORDER BY last_modified DESC",
            (f"%{keyword}%", f"%{keyword}%", f"%{keyword}%"),
        )
        return jsonify([dict(row) for row in cursor.fetchall()])


@app.route("/api/knowledge", methods=["POST"])
def add_knowledge():
    data = request.json
    title = data.get("title")
    content = data.get("content")
    category = data.get("category", "")
    tags = data.get("tags", "")
    if not title or not content:
        return jsonify({"error": "标题和内容不能为空"}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()
        now = datetime.datetime.now().isoformat()
        cursor.execute(
            "INSERT INTO knowledge (title, content, category, tags, created_date, last_modified) VALUES (?, ?, ?, ?, ?, ?)",
            (title, content, category, tags, now, now),
        )
        conn.commit()
        return jsonify({"message": "知识条目添加成功", "id": cursor.lastrowid})


@app.route("/api/knowledge/<int:knowledge_id>", methods=["PUT"])
def update_knowledge(knowledge_id):
    data = request.json
    title = data.get("title")
    content = data.get("content")
    category = data.get("category", "")
    tags = data.get("tags", "")
    if not title or not content:
        return jsonify({"error": "标题和内容不能为空"}), 400

    with get_db_connection() as conn:
        cursor = conn.cursor()
        now = datetime.datetime.now().isoformat()
        cursor.execute(
            "UPDATE knowledge SET title = ?, content = ?, category = ?, tags = ?, last_modified = ? WHERE id = ?",
            (title, content, category, tags, now, knowledge_id),
        )
        conn.commit()
        return jsonify({"message": "知识条目更新成功"})


@app.route("/api/knowledge/<int:knowledge_id>", methods=["DELETE"])
def delete_knowledge(knowledge_id):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM knowledge WHERE id = ?", (knowledge_id,))
        conn.commit()
        return jsonify({"message": "知识条目删除成功"})


# ---------- 任务 API ----------
@app.route("/api/tasks", methods=["GET"])
def get_all_tasks():
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tasks ORDER BY created_at DESC")
            return jsonify([dict(row) for row in cursor.fetchall()])
    except Exception as e:
        print("Error fetching tasks:", e)
        return jsonify({"error": "Failed to fetch tasks"}), 500


@app.route("/api/tasks", methods=["POST"])
def add_task():
    data = request.json
    content = data.get("content")
    if not content:
        return jsonify({"error": "任务内容不能为空"}), 400
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO tasks (content, completed) VALUES (?, ?)", (content, False)
        )
        conn.commit()
        task_id = cursor.lastrowid
        return jsonify({"id": task_id, "content": content, "completed": False})


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    completed = request.json.get("completed", False)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE tasks SET completed = ? WHERE id = ?", (completed, task_id)
        )
        conn.commit()
        return jsonify({"message": "任务状态更新成功"})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        return jsonify({"message": "任务删除成功"})


# ---------- 主页 ----------
@app.route("/")
def index():
    return render_template("index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
