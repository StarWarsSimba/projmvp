import os
import random
import uuid

from flask import Flask, jsonify, render_template, request, session
from pymongo import MongoClient, ReturnDocument


app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "local-development-key-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

mongo_client = MongoClient(
    os.environ.get("MONGO_URI", "mongodb://localhost:27017/fishing_game"),
    serverSelectionTimeoutMS=5000,
)
database = mongo_client.get_default_database()
items_collection = database.items
players_collection = database.players

ITEMS = [
    {"id": "dart_monkey", "name": "BTD6 0-0-0 Dart Monkey", "rarity": "Common", "points": 5, "sell_value": 3, "weight": 50, "min_distance": 0},
    {"id": "triple_spike", "name": "Geometry Dash Triple Spike", "rarity": "Common", "points": 6, "sell_value": 3, "weight": 38, "min_distance": 0},
    {"id": "wave", "name": "Geometry Dash Wave", "rarity": "Rare", "points": 15, "sell_value": 8, "weight": 20, "min_distance": 15},
    {"id": "sniper_monkey", "name": "BTD6 4-2-0 Sniper Monkey", "rarity": "Rare", "points": 18, "sell_value": 9, "weight": 16, "min_distance": 25},
    {"id": "mirror_portal", "name": "Geometry Dash Mirror Portal", "rarity": "Rare", "points": 20, "sell_value": 10, "weight": 13, "min_distance": 35},
    {"id": "cube_459", "name": "Cube 459", "rarity": "Epic", "points": 40, "sell_value": 20, "weight": 9, "min_distance": 45},
    {"id": "super_monkey", "name": "BTD6 0-0-5 Super Monkey", "rarity": "Epic", "points": 50, "sell_value": 24, "weight": 7, "min_distance": 55},
    {"id": "fortified_ddt", "name": "BTD6 Fortified DDT", "rarity": "Epic", "points": 55, "sell_value": 26, "weight": 6, "min_distance": 60},
    {"id": "bloodbath", "name": "Geometry Dash Bloodbath", "rarity": "Epic", "points": 60, "sell_value": 28, "weight": 5, "min_distance": 65},
    {"id": "frame_perfect", "name": "Geometry Dash 60hz frame perfect", "rarity": "Legendary", "points": 100, "sell_value": 50, "weight": 4, "min_distance": 75},
    {"id": "mythic_level", "name": "Geometry Dash Mythic Level", "rarity": "Legendary", "points": 120, "sell_value": 60, "weight": 3, "min_distance": 82},
    {"id": "elite_bloonarius", "name": "BTD6 Elite Bloonarius", "rarity": "Legendary", "points": 150, "sell_value": 75, "weight": 2, "min_distance": 90},
]

UPGRADES = {
    "improved_sleep": {
        "name": "Improved sleep",
        "description": "A little more luck on Rare and Epic catches.",
        "base_cost": 15,
        "luck_bonus": 0.25,
    },
    "peace_of_mind": {
        "name": "Peace of mind",
        "description": "A bigger luck boost, especially for Legendary catches.",
        "base_cost": 30,
        "luck_bonus": 0.5,
    },
}

RARITY_LUCK = {"Common": 0, "Rare": 1, "Epic": 1.5, "Legendary": 2}


def public_item(item):
    return {key: item[key] for key in ("id", "name", "rarity", "points", "sell_value", "min_distance")}


def current_player_id():
    if "player_id" not in session:
        session["player_id"] = str(uuid.uuid4())
    return session["player_id"]


def get_player():
    player_id = current_player_id()
    players_collection.update_one(
        {"_id": player_id},
        {
            "$setOnInsert": {
                "points": 0,
                "coins": 30,
                "inventory": {},
                "upgrades": {"improved_sleep": 0, "peace_of_mind": 0},
            }
        },
        upsert=True,
    )
    return players_collection.find_one({"_id": player_id})


def player_state(player):
    inventory = player.get("inventory", {})
    upgrades = player.get("upgrades", {})
    return {
        "points": player.get("points", 0),
        "coins": player.get("coins", 0),
        "inventory": inventory,
        "upgrades": upgrades,
        "upgrade_options": [
            {
                "id": upgrade_id,
                "name": upgrade["name"],
                "description": upgrade["description"],
                "level": upgrades.get(upgrade_id, 0),
                "cost": upgrade["base_cost"] * (upgrades.get(upgrade_id, 0) + 1),
            }
            for upgrade_id, upgrade in UPGRADES.items()
        ],
    }


def json_error(message, status):
    return jsonify({"error": message}), status


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/items")
def list_items():
    items = list(items_collection.find({}, {"_id": 0, "weight": 0}))
    return jsonify({"items": items})


@app.get("/api/state")
def get_state():
    return jsonify({"player": player_state(get_player())})


@app.post("/api/cast")
def cast():
    if session.get("pending_catch"):
        return json_error("Type out your current catch before casting again.", 409)

    data = request.get_json(silent=True) or {}
    distance = data.get("distance")
    if isinstance(distance, bool) or not isinstance(distance, int) or not 0 <= distance <= 100:
        return json_error("Distance must be a whole number from 0 to 100.", 400)

    player = get_player()
    eligible_items = [item for item in ITEMS if item["min_distance"] <= distance]
    luck_bonus = sum(
        player.get("upgrades", {}).get(upgrade_id, 0) * upgrade["luck_bonus"]
        for upgrade_id, upgrade in UPGRADES.items()
    )
    weights = [
        item["weight"] * (1 + luck_bonus * RARITY_LUCK[item["rarity"]])
        for item in eligible_items
    ]
    caught_item = random.choices(eligible_items, weights=weights, k=1)[0]
    session["pending_catch"] = caught_item["id"]
    return jsonify({"item": public_item(caught_item), "distance": distance})


@app.post("/api/catch")
def catch_item():
    pending_id = session.get("pending_catch")
    if not pending_id:
        return json_error("Cast first to get something on your line.", 409)

    data = request.get_json(silent=True) or {}
    item = next((candidate for candidate in ITEMS if candidate["id"] == pending_id), None)
    if item is None:
        session.pop("pending_catch", None)
        return json_error("That catch is no longer available. Cast again.", 409)

    item_id = data.get("item_id")
    guess = data.get("guess")
    session.pop("pending_catch", None)
    if item_id != item["id"] or not isinstance(guess, str) or guess.strip().casefold() != item["name"].casefold():
        return json_error("Not quite — it got away. Cast again and try another catch.", 422)

    player_id = current_player_id()
    player = players_collection.find_one_and_update(
        {"_id": player_id},
        {"$inc": {f"inventory.{item['id']}": 1, "points": item["points"]}},
        return_document=ReturnDocument.AFTER,
    )
    return jsonify({"caught": public_item(item), "player": player_state(player)})


@app.post("/api/sell")
def sell_item():
    data = request.get_json(silent=True) or {}
    item_id = data.get("item_id")
    quantity = data.get("quantity", 1)
    item = next((candidate for candidate in ITEMS if candidate["id"] == item_id), None)
    if item is None:
        return json_error("Choose an item from your collection to sell.", 400)
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
        return json_error("Quantity must be a positive whole number.", 400)

    player_id = current_player_id()
    result = players_collection.update_one(
        {"_id": player_id, f"inventory.{item['id']}": {"$gte": quantity}},
        {
            "$inc": {
                f"inventory.{item['id']}": -quantity,
                "coins": item["sell_value"] * quantity,
            }
        },
    )
    if result.modified_count != 1:
        return json_error("You do not have enough of that item to sell.", 409)
    return jsonify({"player": player_state(get_player())})


@app.post("/api/upgrades")
def buy_upgrade():
    data = request.get_json(silent=True) or {}
    upgrade_id = data.get("upgrade_id")
    upgrade = UPGRADES.get(upgrade_id)
    if upgrade is None:
        return json_error("Choose a valid in-game upgrade.", 400)

    player = get_player()
    level = player.get("upgrades", {}).get(upgrade_id, 0)
    cost = upgrade["base_cost"] * (level + 1)
    result = players_collection.update_one(
        {
            "_id": player["_id"],
            "coins": {"$gte": cost},
            f"upgrades.{upgrade_id}": level,
        },
        {"$inc": {"coins": -cost, f"upgrades.{upgrade_id}": 1}},
    )
    if result.modified_count != 1:
        return json_error("Not enough coins for that upgrade. Sell a catch to earn more.", 409)
    return jsonify({"player": player_state(get_player())})


def seed_items():
    for item in ITEMS:
        items_collection.update_one(
            {"_id": item["id"]},
            {"$set": item},
            upsert=True,
        )


if __name__ == "__main__":
    seed_items()
    app.run(host="0.0.0.0", port=5000, debug=False)