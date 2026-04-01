import os
import struct
import json
from base64 import b64encode
from config import COVER_PACKET_SIZE, BLOCK_SIZES

_cover_sequence = 0


def generate_cover_packet() -> dict:
    """Generate a cover packet indistinguishable from a real packet."""
    global _cover_sequence

    cover_data = bytearray(os.urandom(COVER_PACKET_SIZE))
    # Byte 0: 0x00 = cover packet marker
    cover_data[0] = 0x00

    _cover_sequence += 1
    return {
        "data": b64encode(bytes(cover_data)).decode(),
        "size": COVER_PACKET_SIZE,
        "seq": _cover_sequence,
    }


def wrap_real_packet(json_payload: str, target_size: int) -> dict:
    """Wrap a real message packet into HPO wire format with padding."""
    global _cover_sequence

    payload_bytes = json_payload.encode("utf-8")
    padded = bytearray(target_size)

    # Byte 0: 0x01 = real packet marker
    padded[0] = 0x01

    # Bytes 1-4: actual payload length (big-endian uint32)
    struct.pack_into(">I", padded, 1, len(payload_bytes))

    # Bytes 5+: actual payload
    padded[5:5 + len(payload_bytes)] = payload_bytes

    # Fill remaining with random bytes
    remaining = target_size - 5 - len(payload_bytes)
    if remaining > 0:
        padded[5 + len(payload_bytes):] = os.urandom(remaining)

    _cover_sequence += 1
    return {
        "data": b64encode(bytes(padded)).decode(),
        "size": target_size,
        "seq": _cover_sequence,
    }


def select_block_size(payload_length: int) -> int:
    """Determine the appropriate block size for a given payload."""
    total_needed = payload_length + 5  # 1 byte type + 4 bytes length
    for size in BLOCK_SIZES:
        if total_needed <= size:
            return size
    return BLOCK_SIZES[-1]
