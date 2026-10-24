"""WebSocket hub. Events are tiny pings ({"type", "lot_id"}); clients refetch the lot over REST.

NOTE: rooms live in process memory, so run ONE uvicorn worker (see README, "Limitações").
"""
from collections import defaultdict

import anyio
from fastapi import WebSocket


class Hub:
    def __init__(self) -> None:
        self.rooms: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, lot_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self.rooms[lot_id].add(ws)

    def disconnect(self, lot_id: int, ws: WebSocket) -> None:
        self.rooms[lot_id].discard(ws)

    async def broadcast(self, lot_id: int, event: dict) -> None:
        for ws in list(self.rooms.get(lot_id, ())):
            try:
                await ws.send_json(event)
            except Exception:
                self.rooms[lot_id].discard(ws)


hub = Hub()


def publish(lot_id: int, event_type: str) -> None:
    """Call from sync code running in a worker thread. A no-op anywhere else (scripts, unit tests)."""
    try:
        anyio.from_thread.run(hub.broadcast, lot_id, {"type": event_type, "lot_id": lot_id})
    except Exception:
        pass
