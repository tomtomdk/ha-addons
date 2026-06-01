from flask import Flask, request, render_template_string
from datetime import datetime, timezone

app = Flask(__name__)

TOKEN_FILE = "/config/anycubic_web_token.txt"

PAGE = """
<!doctype html>
<html>
<head>
  <title>Anycubic Web Token Helper</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 900px;
      margin: 40px auto;
      background: #111827;
      color: #f9fafb;
      line-height: 1.5;
    }

    textarea, input {
      width: 100%;
      box-sizing: border-box;
      background: #1f2937;
      color: #f9fafb;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 12px;
      font-family: monospace;
    }

    textarea {
      height: 160px;
    }

    button {
      padding: 12px 18px;
      margin-top: 12px;
      border: 0;
      border-radius: 8px;
      background: #2563eb;
      color: white;
      cursor: pointer;
      font-weight: 600;
    }

    code, pre {
      word-break: break-all;
      white-space: pre-wrap;
      display: block;
      background: #1f2937;
      padding: 12px;
      border: 1px solid #374151;
      border-radius: 8px;
    }

    .ok {
      color: #86efac;
    }

    .error {
      color: #fca5a5;
    }

    .muted {
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <h1>Anycubic Web Token Helper</h1>

  <p>
    Open the Anycubic Cloud website, log in, open browser developer tools,
    then run:
  </p>

  <pre>copy(window.localStorage["XX-Token"])</pre>

  <p>Then paste the token below.</p>

  <form method="post">
    <textarea name="token" placeholder="Paste Anycubic XX-Token here"></textarea>
    <br>
    <button type="submit">Save token</button>
  </form>

  {% if error %}
    <h2 class="error">Error</h2>
    <p>{{ error }}</p>
  {% endif %}

  {% if token %}
    <h2 class="ok">Token saved</h2>
    <p class="muted">Saved to <code>/config/anycubic_web_token.txt</code></p>
    <p class="muted">Saved at: {{ saved_at }}</p>
    <p class="muted">Token length: {{ token_length }}</p>

    <code id="token">{{ token }}</code>

    <button onclick="navigator.clipboard.writeText(document.getElementById('token').innerText)">
      Copy token
    </button>
  {% endif %}
</body>
</html>
"""

@app.route("/", methods=["GET", "POST"])
def index():
    token = None
    error = None
    saved_at = None

    if request.method == "POST":
        token = request.form.get("token", "").strip()

        if not token:
            error = "No token was pasted."
            token = None
        elif len(token) < 50:
            error = "That token looks too short. Make sure you copied the full XX-Token."
            token = None
        else:
            saved_at = datetime.now(timezone.utc).isoformat()

            with open(TOKEN_FILE, "w", encoding="utf-8") as f:
                f.write(token + "\\n")

    return render_template_string(
        PAGE,
        token=token,
        error=error,
        token_length=len(token) if token else 0,
        saved_at=saved_at,
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8099)