#!/usr/bin/env python3
"""
Traffic Capture Script for HPO Evaluation

Captures WebSocket traffic from the chat application and extracts
packet metadata (sizes, timestamps, inter-packet delays) for
subsequent traffic analysis with ML classifiers.

Usage:
    python capture_traffic.py --output data/capture_hpo_on.csv --duration 300
    python capture_traffic.py --output data/capture_hpo_off.csv --duration 300
"""

import argparse
import csv
import time
import json
import asyncio
import websockets
from datetime import datetime


def parse_args():
    parser = argparse.ArgumentParser(description="Capture WebSocket traffic metadata")
    parser.add_argument("--output", "-o", required=True, help="Output CSV file path")
    parser.add_argument("--duration", "-d", type=int, default=300, help="Capture duration in seconds")
    parser.add_argument("--host", default="localhost", help="Server host")
    parser.add_argument("--port", type=int, default=3000, help="Server port")
    return parser.parse_args()


class TrafficCapture:
    def __init__(self, output_path: str):
        self.output_path = output_path
        self.packets = []
        self.start_time = None

    def record_packet(self, direction: str, size: int, raw_data: bytes = None):
        now = time.time()
        if self.start_time is None:
            self.start_time = now

        elapsed = now - self.start_time
        self.packets.append({
            "timestamp": datetime.now().isoformat(),
            "elapsed_ms": round(elapsed * 1000, 2),
            "direction": direction,  # "send" or "recv"
            "size_bytes": size,
            "inter_packet_ms": 0,  # Computed later
        })

        # Compute inter-packet delay
        if len(self.packets) > 1:
            prev = self.packets[-2]
            self.packets[-1]["inter_packet_ms"] = round(
                self.packets[-1]["elapsed_ms"] - prev["elapsed_ms"], 2
            )

    def save(self):
        if not self.packets:
            print("No packets captured.")
            return

        with open(self.output_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "timestamp", "elapsed_ms", "direction",
                "size_bytes", "inter_packet_ms"
            ])
            writer.writeheader()
            writer.writerows(self.packets)

        print(f"\nSaved {len(self.packets)} packets to {self.output_path}")

        # Print summary
        sizes = [p["size_bytes"] for p in self.packets]
        delays = [p["inter_packet_ms"] for p in self.packets if p["inter_packet_ms"] > 0]
        print(f"  Packet count: {len(self.packets)}")
        print(f"  Size range: {min(sizes)}-{max(sizes)} bytes")
        print(f"  Unique sizes: {sorted(set(sizes))}")
        if delays:
            print(f"  Avg inter-packet delay: {sum(delays)/len(delays):.1f}ms")
            print(f"  Std inter-packet delay: {std_dev(delays):.1f}ms")


def std_dev(values):
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / (len(values) - 1)
    return variance ** 0.5


async def capture_websocket(args, capture: TrafficCapture):
    """Connect to the Socket.IO server and capture packet metadata."""
    uri = f"ws://{args.host}:{args.port}/api/socketio/?EIO=4&transport=websocket"

    print(f"Connecting to {uri}...")
    print(f"Capturing for {args.duration} seconds...")

    try:
        async with websockets.connect(uri) as ws:
            end_time = time.time() + args.duration

            while time.time() < end_time:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    if isinstance(msg, bytes):
                        capture.record_packet("recv", len(msg))
                    else:
                        capture.record_packet("recv", len(msg.encode("utf-8")))
                except asyncio.TimeoutError:
                    continue

    except Exception as e:
        print(f"Connection error: {e}")
        print("Note: Make sure the chat server is running and users are active.")


def main():
    args = parse_args()
    capture = TrafficCapture(args.output)

    print("=" * 60)
    print("HPO Traffic Capture Tool")
    print("=" * 60)

    try:
        asyncio.run(capture_websocket(args, capture))
    except KeyboardInterrupt:
        print("\nCapture interrupted by user.")
    finally:
        capture.save()


if __name__ == "__main__":
    main()
