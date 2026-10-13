import os

from flask import Flask

app = Flask(__name__)


@app.get("/")
def index():
    return "vibe-ok"


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 3000)))
