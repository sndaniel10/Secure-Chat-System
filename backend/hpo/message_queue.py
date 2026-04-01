from collections import deque
from config import MAX_QUEUE_DEPTH

# Per-user outbound queues
_queues: dict[str, deque] = {}


def enqueue_message(user_id: str, packet_data: dict):
    if user_id not in _queues:
        _queues[user_id] = deque(maxlen=MAX_QUEUE_DEPTH)
    _queues[user_id].append(packet_data)


def dequeue_message(user_id: str) -> dict | None:
    q = _queues.get(user_id)
    if q and len(q) > 0:
        return q.popleft()
    return None


def get_queue_depth(user_id: str) -> int:
    q = _queues.get(user_id)
    return len(q) if q else 0


def clear_queue(user_id: str):
    _queues.pop(user_id, None)
