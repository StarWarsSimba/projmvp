Idea: Fishing Game
Fish for different 'fish'
Catch things from different games
Get points from things you catch
The rarer something is, the more points you get
Items of different rarity have different odds

Examples of things you can catch:
- BTD6 0-0-0 Dart Monkey (common)
- BTD6 4-2-0 Sniper Monkey (rare)
- BTD6 0-0-5 Super Monkey (epic)
- BTD6 Fortified DDT (epic)
- BTD6 Elite Bloonarius (legendary)
- Cube 459 (epic)
- Geometry Dash Triple Spike
- Geometry Dash 60hz frame perfect
- Geometry Dash Mythic Level
- Geometry Dash Mirror Portal
- Geometry Dash Wave
- Geometry Dash Bloodbath

Purchase things that increase chances for better loot
- Improved sleep
- Peace of mind

Sell things for coins
Time the cast to reach farther

To catch something, type it out

## Run the playable MVP

The app uses Flask for the REST API and page, MongoDB for player progress, and
JavaScript requests for casts, catches, upgrades, and sales.

1. Install Docker Desktop (including Docker Compose).
2. From this folder, run:

   ```sh
   docker compose up --build
   ```

3. Open [http://localhost:8000](http://localhost:8000).
4. Start the meter and stop it to cast. A farther cast can reach rarer catches.
   Type the displayed item name to reel it in.
5. Sell catches from your collection for coins, then buy in-game luck upgrades.
   Points are awarded when you catch an item.

MongoDB data is kept in the `mongo-data` Docker volume. Stop the app with
`Ctrl+C`; use `docker compose down` to stop and remove its containers. The
volume remains so your collection is there the next time you start the app.

This is a local-development MVP using Flask's built-in server and a development
secret by default. Do not expose it publicly; set a private `FLASK_SECRET_KEY`
before sharing it beyond your machine.

### API overview

- `GET /api/items` — item catalog
- `GET /api/state` — current player's points, coins, inventory, and upgrades
- `POST /api/cast` — choose an item based on cast distance and current upgrades
- `POST /api/catch` — validate the typed item name and award points
- `POST /api/sell` — sell an item from the collection for coins
- `POST /api/upgrades` — purchase a luck upgrade