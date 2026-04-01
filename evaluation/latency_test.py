#!/usr/bin/env python3
"""
Latency Measurement Script for HPO Evaluation

Measures the end-to-end message delivery latency overhead introduced
by the HPO layer (CRT queuing + padding).

Research Objective (from proposal):
  - Target: Average latency overhead < 5 seconds
  - CRT interval: 500ms (worst-case single hop delay)
  - Expected: ~250ms average queueing delay + encryption + padding overhead

Usage:
    python latency_test.py --output data/latency_results.csv --messages 100
"""

import argparse
import csv
import json
import time
import asyncio
import statistics
import socketio


def parse_args():
    parser = argparse.ArgumentParser(description="Measure HPO latency overhead")
    parser.add_argument("--output", "-o", default="data/latency_results.csv", help="Output CSV path")
    parser.add_argument("--messages", "-n", type=int, default=100, help="Number of test messages")
    parser.add_argument("--host", default="http://localhost:3000", help="Server URL")
    parser.add_argument("--user-id", required=True, help="Authenticated user ID")
    parser.add_argument("--conversation-id", required=True, help="Target conversation ID")
    parser.add_argument("--recipient-id", required=True, help="Recipient user ID")
    return parser.parse_args()


class LatencyTest:
    def __init__(self, server_url: str, user_id: str):
        self.sio = socketio.AsyncClient(logger=False)
        self.server_url = server_url
        self.user_id = user_id
        self.results = []
        self.pending = {}  # send_time keyed by message content
        self.connected = False

        @self.sio.on("connect")
        async def on_connect():
            self.connected = True
            print("[Latency] Connected to server")

        @self.sio.on("hpo:packet")
        async def on_hpo_packet(data):
            recv_time = time.time()
            # Try to extract the timestamp marker from the packet
            try:
                raw = data.get("data", "")
                # Decode base64 and check for our marker
                import base64
                buf = base64.b64decode(raw)
                if buf[0] == 0x01:  # Real packet
                    payload_len = int.from_bytes(buf[1:5], "big")
                    payload = buf[5:5 + payload_len].decode("utf-8")
                    pkt = json.loads(payload)
                    ciphertext = pkt.get("ciphertext", "")
                    if ciphertext.startswith("LATENCY_TEST_"):
                        marker = ciphertext
                        if marker in self.pending:
                            send_time = self.pending.pop(marker)
                            latency_ms = (recv_time - send_time) * 1000
                            self.results.append({
                                "message_id": marker,
                                "send_time": send_time,
                                "recv_time": recv_time,
                                "latency_ms": round(latency_ms, 2),
                            })
            except Exception:
                pass  # Not our test packet

        @self.sio.on("message:receive")
        async def on_message(data):
            recv_time = time.time()
            ciphertext = data.get("ciphertext", "")
            if ciphertext.startswith("LATENCY_TEST_"):
                if ciphertext in self.pending:
                    send_time = self.pending.pop(ciphertext)
                    latency_ms = (recv_time - send_time) * 1000
                    self.results.append({
                        "message_id": ciphertext,
                        "send_time": send_time,
                        "recv_time": recv_time,
                        "latency_ms": round(latency_ms, 2),
                    })

    async def connect(self):
        await self.sio.connect(
            self.server_url,
            socketio_path="/api/socketio",
            transports=["websocket"],
        )
        # Authenticate
        await self.sio.emit("user:authenticate", self.user_id)
        await asyncio.sleep(1)

    async def send_test_message(
        self, conversation_id: str, recipient_id: str, seq: int
    ):
        marker = f"LATENCY_TEST_{seq}_{time.time()}"
        self.pending[marker] = time.time()

        await self.sio.emit("message:send", {
            "id": "",
            "conversationId": conversation_id,
            "senderId": self.user_id,
            "recipientId": recipient_id,
            "ciphertext": marker,
            "ratchetHeader": "",
            "timestamp": int(time.time() * 1000),
        })

    async def disconnect(self):
        await self.sio.disconnect()

    def save_results(self, output_path: str):
        if not self.results:
            print("No latency measurements collected.")
            return

        with open(output_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "message_id", "send_time", "recv_time", "latency_ms"
            ])
            writer.writeheader()
            writer.writerows(self.results)

        latencies = [r["latency_ms"] for r in self.results]
        print(f"\nLatency Results ({len(latencies)} messages):")
        print(f"  Mean:   {statistics.mean(latencies):.1f}ms")
        print(f"  Median: {statistics.median(latencies):.1f}ms")
        print(f"  Std:    {statistics.stdev(latencies):.1f}ms" if len(latencies) > 1 else "")
        print(f"  Min:    {min(latencies):.1f}ms")
        print(f"  Max:    {max(latencies):.1f}ms")
        print(f"  P95:    {sorted(latencies)[int(len(latencies) * 0.95)]:.1f}ms")

        target_ms = 5000
        within_target = sum(1 for l in latencies if l < target_ms)
        print(f"\n  Within {target_ms}ms target: {within_target}/{len(latencies)} ({within_target/len(latencies)*100:.1f}%)")
        print(f"  Saved to {output_path}")


async def run_test(args):
    test = LatencyTest(args.host, args.user_id)

    try:
        await test.connect()
        print(f"\nSending {args.messages} test messages...")

        for i in range(args.messages):
            await test.send_test_message(
                args.conversation_id, args.recipient_id, i
            )
            # Wait between messages (simulating user typing)
            await asyncio.sleep(0.5 + (i % 3) * 0.2)

            if (i + 1) % 10 == 0:
                print(f"  Sent {i + 1}/{args.messages} messages, "
                      f"{len(test.results)} responses received")

        # Wait for remaining responses
        print("Waiting for remaining responses...")
        await asyncio.sleep(5)

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await test.disconnect()
        test.save_results(args.output)


def main():
    args = parse_args()

    print("=" * 60)
    print("HPO Latency Measurement Tool")
    print("=" * 60)

    asyncio.run(run_test(args))


if __name__ == "__main__":
    main()
