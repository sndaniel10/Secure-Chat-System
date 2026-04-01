import asyncio
import json
from config import CRT_INTERVAL_MS, HPO_ENABLED
from hpo.message_queue import dequeue_message, get_queue_depth
from hpo.cover_traffic import generate_cover_packet, wrap_real_packet, select_block_size
import config

_crt_task: asyncio.Task | None = None
_total_cover_sent = 0
_total_real_sent = 0


async def _crt_loop():
    """
    Constant Rate Transmission engine.
    Dispatches one packet per connected user every CRT_INTERVAL_MS.
    Real messages from the queue are sent when available; otherwise cover traffic.
    """
    global _total_cover_sent, _total_real_sent

    # Import here to avoid circular dependency
    from websocket.manager import manager

    print(f"[CRT] Starting engine (interval: {CRT_INTERVAL_MS}ms)")

    while True:
        try:
            if config.HPO_ENABLED:
                online = manager.get_online_users()

                for user_id in list(online.keys()):
                    queued = dequeue_message(user_id)

                    if queued and queued.get("type") == "real" and queued.get("packet"):
                        # Real message: wrap in HPO format
                        json_payload = json.dumps(queued["packet"])
                        block_size = select_block_size(len(json_payload))
                        wire_packet = wrap_real_packet(json_payload, block_size)

                        await manager.send_to_user(user_id, {
                            "type": "hpo:packet",
                            **wire_packet,
                        })
                        _total_real_sent += 1
                    else:
                        # No real message: send cover traffic
                        cover = generate_cover_packet()
                        await manager.send_to_user(user_id, {
                            "type": "hpo:packet",
                            **cover,
                        })
                        _total_cover_sent += 1

        except Exception as e:
            print(f"[CRT] Error in loop: {e}")

        await asyncio.sleep(CRT_INTERVAL_MS / 1000)


def start_crt():
    """Start the CRT engine as a background asyncio task."""
    global _crt_task

    if not config.HPO_ENABLED:
        print("[CRT] HPO disabled, CRT engine not started")
        return

    if _crt_task:
        _crt_task.cancel()

    _crt_task = asyncio.create_task(_crt_loop())


def stop_crt():
    """Stop the CRT engine."""
    global _crt_task
    if _crt_task:
        _crt_task.cancel()
        _crt_task = None
        print("[CRT] Engine stopped")


def get_hpo_status(user_id: str | None = None) -> dict:
    return {
        "crtInterval": CRT_INTERVAL_MS,
        "coverPacketsSent": _total_cover_sent,
        "realPacketsSent": _total_real_sent,
        "queueDepth": get_queue_depth(user_id) if user_id else 0,
        "hpoEnabled": config.HPO_ENABLED,
    }
