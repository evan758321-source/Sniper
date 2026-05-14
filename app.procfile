from flask import Flask, request, jsonify, session, redirect, render_template, url_for
from flask_cors import CORS
import requests
import os
import secrets
from functools import wraps
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
CORS(app, supports_credentials=True)

BEATLEADER_API = "https://api.beatleader.com"
BEATLEADER_AUTH = "https://api.beatleader.com/oauth2/authorize"
BEATLEADER_TOKEN = "https://api.beatleader.com/oauth2/token"

CLIENT_ID = os.environ.get("BEATLEADER_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("BEATLEADER_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("REDIRECT_URI", "https://sniper.evanblokender.org/callback")


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "access_token" not in session:
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return decorated


def bl_get(path, token=None, params=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.get(f"{BEATLEADER_API}{path}", headers=headers, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


# ── Pages ──────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    logged_in = "access_token" in session
    return render_template("index.html", logged_in=logged_in)


# ── Auth ───────────────────────────────────────────────────────────────────────

@app.route("/login")
def login():
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "profile offline_access",
        "state": state,
    }
    from urllib.parse import urlencode
    return redirect(f"{BEATLEADER_AUTH}?{urlencode(params)}")


@app.route("/callback")
def callback():
    code = request.args.get("code")
    state = request.args.get("state")

    if state != session.get("oauth_state"):
        return redirect("/?error=invalid_state")

    try:
        r = requests.post(BEATLEADER_TOKEN, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }, timeout=15)
        r.raise_for_status()
        tokens = r.json()
        session["access_token"] = tokens["access_token"]
        session["refresh_token"] = tokens.get("refresh_token")
        # Fetch & cache our own profile id
        me = bl_get("/v3/profile/me", token=session["access_token"])
        session["player_id"] = me.get("id") or me.get("playerId")
        session["player_name"] = me.get("name")
    except Exception as e:
        return redirect(f"/?error=auth_failed&detail={str(e)}")

    return redirect("/")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


# ── API proxy endpoints ─────────────────────────────────────────────────────────

@app.route("/api/me")
@login_required
def api_me():
    try:
        data = bl_get("/v3/profile/me", token=session["access_token"])
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/player/<player_id>")
@login_required
def api_player(player_id):
    try:
        data = bl_get(f"/player/{player_id}/full", token=session["access_token"])
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/friends")
@login_required
def api_friends():
    try:
        player_id = session.get("player_id")
        data = bl_get(f"/player/{player_id}/friends", token=session["access_token"])
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scores/player/<player_id>")
@login_required
def api_player_scores(player_id):
    try:
        page = request.args.get("page", 1)
        count = request.args.get("count", 8)
        sort = request.args.get("sortBy", "date")
        order = request.args.get("order", "desc")
        data = bl_get(
            f"/player/{player_id}/scores",
            token=session["access_token"],
            params={"page": page, "count": count, "sortBy": sort, "order": order}
        )
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scores/me")
@login_required
def api_my_scores():
    try:
        player_id = session.get("player_id")
        page = request.args.get("page", 1)
        count = request.args.get("count", 8)
        sort = request.args.get("sortBy", "date")
        order = request.args.get("order", "desc")
        data = bl_get(
            f"/player/{player_id}/scores",
            token=session["access_token"],
            params={"page": page, "count": count, "sortBy": sort, "order": order}
        )
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/snipe/<friend_id>")
@login_required
def api_snipe_targets(friend_id):
    """
    Compare friend's scores vs my scores on the same maps.
    Returns maps where friend beats me (snipeable targets).
    """
    try:
        my_id = session.get("player_id")
        token = session["access_token"]

        # Fetch friend's top scores
        friend_data = bl_get(
            f"/player/{friend_id}/scores",
            token=token,
            params={"page": 1, "count": 100, "sortBy": "pp", "order": "desc"}
        )

        friend_scores = friend_data.get("data", [])
        if not friend_scores:
            return jsonify({"targets": [], "friend": {}})

        # Collect map leaderboard IDs the friend has played
        leaderboard_ids = [s["leaderboardId"] for s in friend_scores if s.get("leaderboardId")]

        # Fetch my scores on the same maps
        my_scores_map = {}
        my_data = bl_get(
            f"/player/{my_id}/scores",
            token=token,
            params={"page": 1, "count": 100, "sortBy": "pp", "order": "desc"}
        )
        for s in my_data.get("data", []):
            lid = s.get("leaderboardId")
            if lid:
                my_scores_map[lid] = s

        targets = []
        for fs in friend_scores:
            lid = fs.get("leaderboardId")
            if not lid:
                continue
            my_score = my_scores_map.get(lid)
            friend_acc = fs.get("accuracy", 0) or 0
            my_acc = my_score.get("accuracy", 0) if my_score else 0
            friend_rank = fs.get("rank", 9999) or 9999

            snipeable = my_acc < friend_acc or my_score is None
            if snipeable:
                targets.append({
                    "leaderboardId": lid,
                    "songName": fs.get("song", {}).get("name", "Unknown") if fs.get("song") else (fs.get("leaderboard", {}).get("song", {}).get("name", "Unknown")),
                    "songAuthor": fs.get("song", {}).get("author", "") if fs.get("song") else "",
                    "coverImage": fs.get("song", {}).get("coverImage", "") if fs.get("song") else (fs.get("leaderboard", {}).get("song", {}).get("coverImage", "")),
                    "difficulty": fs.get("difficulty", {}).get("difficultyName", "") if fs.get("difficulty") else "",
                    "friendAcc": round(friend_acc * 100, 2),
                    "myAcc": round(my_acc * 100, 2) if my_score else None,
                    "friendPP": round(fs.get("pp", 0) or 0, 2),
                    "myPP": round(my_score.get("pp", 0) or 0, 2) if my_score else None,
                    "friendRank": friend_rank,
                    "myRank": my_score.get("rank") if my_score else None,
                    "gap": round((friend_acc - my_acc) * 100, 2),
                    "played": my_score is not None,
                })

        targets.sort(key=lambda x: x["gap"])

        # Get friend info
        friend_info = bl_get(f"/player/{friend_id}", token=token)

        return jsonify({
            "targets": targets,
            "friend": {
                "id": friend_id,
                "name": friend_info.get("name", ""),
                "avatar": friend_info.get("avatar", ""),
                "rank": friend_info.get("rank", 0),
                "pp": friend_info.get("pp", 0),
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/leaderboard/<leaderboard_id>")
@login_required
def api_leaderboard(leaderboard_id):
    try:
        data = bl_get(f"/leaderboard/{leaderboard_id}", token=session["access_token"])
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/status")
def api_status():
    return jsonify({
        "logged_in": "access_token" in session,
        "player_id": session.get("player_id"),
        "player_name": session.get("player_name"),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("DEBUG", "false").lower() == "true")
