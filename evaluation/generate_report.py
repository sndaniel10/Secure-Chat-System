#!/usr/bin/env python3
"""
Generate Evaluation Report with Visualizations

Creates charts and summary statistics for the HPO evaluation,
suitable for inclusion in the university project report.

Usage:
    python generate_report.py \
        --hpo-off data/capture_hpo_off.csv \
        --hpo-on data/capture_hpo_on.csv \
        --latency data/latency_results.csv \
        --output-dir report/
"""

import argparse
import csv
import os
import sys
from collections import Counter

import numpy as np

try:
    import matplotlib
    matplotlib.use("Agg")  # Non-interactive backend
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    print("Warning: matplotlib not installed. Charts will not be generated.")


def parse_args():
    parser = argparse.ArgumentParser(description="Generate HPO evaluation report")
    parser.add_argument("--hpo-off", help="HPO-off traffic capture CSV")
    parser.add_argument("--hpo-on", help="HPO-on traffic capture CSV")
    parser.add_argument("--latency", help="Latency results CSV")
    parser.add_argument("--output-dir", default="report", help="Output directory")
    return parser.parse_args()


def load_csv(path):
    rows = []
    with open(path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def plot_size_distribution(packets_off, packets_on, output_dir):
    """Compare packet size distributions with/without HPO."""
    if not HAS_MATPLOTLIB:
        return

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    sizes_off = [int(p["size_bytes"]) for p in packets_off]
    sizes_on = [int(p["size_bytes"]) for p in packets_on]

    # HPO OFF
    ax1.hist(sizes_off, bins=50, color="#e74c3c", alpha=0.7, edgecolor="black")
    ax1.set_title("Packet Size Distribution (HPO OFF)", fontsize=12)
    ax1.set_xlabel("Packet Size (bytes)")
    ax1.set_ylabel("Frequency")
    ax1.axvline(np.mean(sizes_off), color="black", linestyle="--", label=f"Mean: {np.mean(sizes_off):.0f}B")
    ax1.legend()

    # HPO ON
    ax2.hist(sizes_on, bins=50, color="#2ecc71", alpha=0.7, edgecolor="black")
    ax2.set_title("Packet Size Distribution (HPO ON)", fontsize=12)
    ax2.set_xlabel("Packet Size (bytes)")
    ax2.set_ylabel("Frequency")
    ax2.axvline(np.mean(sizes_on), color="black", linestyle="--", label=f"Mean: {np.mean(sizes_on):.0f}B")
    ax2.legend()

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "size_distribution.png"), dpi=150)
    plt.close()
    print("  Generated: size_distribution.png")


def plot_timing_distribution(packets_off, packets_on, output_dir):
    """Compare inter-packet timing distributions."""
    if not HAS_MATPLOTLIB:
        return

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    delays_off = [float(p["inter_packet_ms"]) for p in packets_off if float(p["inter_packet_ms"]) > 0]
    delays_on = [float(p["inter_packet_ms"]) for p in packets_on if float(p["inter_packet_ms"]) > 0]

    ax1.hist(delays_off, bins=50, color="#e74c3c", alpha=0.7, edgecolor="black")
    ax1.set_title("Inter-Packet Delay (HPO OFF)", fontsize=12)
    ax1.set_xlabel("Delay (ms)")
    ax1.set_ylabel("Frequency")

    ax2.hist(delays_on, bins=50, color="#2ecc71", alpha=0.7, edgecolor="black")
    ax2.set_title("Inter-Packet Delay (HPO ON)", fontsize=12)
    ax2.set_xlabel("Delay (ms)")
    ax2.set_ylabel("Frequency")

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "timing_distribution.png"), dpi=150)
    plt.close()
    print("  Generated: timing_distribution.png")


def plot_traffic_timeline(packets_off, packets_on, output_dir):
    """Plot packet sizes over time."""
    if not HAS_MATPLOTLIB:
        return

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8))

    elapsed_off = [float(p["elapsed_ms"]) / 1000 for p in packets_off]
    sizes_off = [int(p["size_bytes"]) for p in packets_off]
    elapsed_on = [float(p["elapsed_ms"]) / 1000 for p in packets_on]
    sizes_on = [int(p["size_bytes"]) for p in packets_on]

    ax1.scatter(elapsed_off, sizes_off, s=2, alpha=0.5, color="#e74c3c")
    ax1.set_title("Traffic Timeline (HPO OFF)", fontsize=12)
    ax1.set_xlabel("Time (seconds)")
    ax1.set_ylabel("Packet Size (bytes)")
    ax1.set_ylim(0, max(sizes_off) * 1.1 if sizes_off else 5000)

    ax2.scatter(elapsed_on, sizes_on, s=2, alpha=0.5, color="#2ecc71")
    ax2.set_title("Traffic Timeline (HPO ON)", fontsize=12)
    ax2.set_xlabel("Time (seconds)")
    ax2.set_ylabel("Packet Size (bytes)")
    ax2.set_ylim(0, max(sizes_on) * 1.1 if sizes_on else 5000)

    # Add block size reference lines
    for size in [1024, 2048, 4096]:
        ax2.axhline(y=size, color="gray", linestyle="--", alpha=0.5, label=f"{size}B block")

    ax2.legend(fontsize=8)
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "traffic_timeline.png"), dpi=150)
    plt.close()
    print("  Generated: traffic_timeline.png")


def plot_latency(latency_data, output_dir):
    """Plot latency distribution."""
    if not HAS_MATPLOTLIB or not latency_data:
        return

    latencies = [float(r["latency_ms"]) for r in latency_data]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

    ax1.hist(latencies, bins=30, color="#3498db", alpha=0.7, edgecolor="black")
    ax1.axvline(np.mean(latencies), color="red", linestyle="--", label=f"Mean: {np.mean(latencies):.0f}ms")
    ax1.axvline(5000, color="orange", linestyle="--", label="Target: 5000ms")
    ax1.set_title("Message Delivery Latency Distribution", fontsize=12)
    ax1.set_xlabel("Latency (ms)")
    ax1.set_ylabel("Frequency")
    ax1.legend()

    # CDF
    sorted_lat = sorted(latencies)
    cdf = np.arange(1, len(sorted_lat) + 1) / len(sorted_lat)
    ax2.plot(sorted_lat, cdf, color="#3498db", linewidth=2)
    ax2.axvline(5000, color="orange", linestyle="--", label="Target: 5000ms")
    ax2.set_title("Latency CDF", fontsize=12)
    ax2.set_xlabel("Latency (ms)")
    ax2.set_ylabel("Cumulative Probability")
    ax2.legend()

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, "latency_analysis.png"), dpi=150)
    plt.close()
    print("  Generated: latency_analysis.png")


def generate_summary(packets_off, packets_on, latency_data, output_dir):
    """Generate text summary."""
    summary = []
    summary.append("=" * 60)
    summary.append("HPO EVALUATION SUMMARY REPORT")
    summary.append("=" * 60)

    if packets_off and packets_on:
        sizes_off = [int(p["size_bytes"]) for p in packets_off]
        sizes_on = [int(p["size_bytes"]) for p in packets_on]

        summary.append(f"\nTraffic Volume:")
        summary.append(f"  HPO OFF: {len(packets_off)} packets")
        summary.append(f"  HPO ON:  {len(packets_on)} packets")

        summary.append(f"\nPacket Size Analysis:")
        summary.append(f"  HPO OFF - Unique sizes: {len(set(sizes_off))}")
        summary.append(f"  HPO ON  - Unique sizes: {len(set(sizes_on))}")
        summary.append(f"  HPO OFF - Size range: {min(sizes_off)}-{max(sizes_off)}B")
        summary.append(f"  HPO ON  - Size range: {min(sizes_on)}-{max(sizes_on)}B")

        # Check if HPO achieves uniform sizes
        on_unique = set(sizes_on)
        expected_blocks = {1024, 2048, 4096}
        if on_unique.issubset(expected_blocks):
            summary.append(f"  HPO ON achieves UNIFORM block sizes: {sorted(on_unique)}")
        else:
            summary.append(f"  HPO ON sizes: {sorted(on_unique)}")

    if latency_data:
        latencies = [float(r["latency_ms"]) for r in latency_data]
        summary.append(f"\nLatency Analysis:")
        summary.append(f"  Messages measured: {len(latencies)}")
        summary.append(f"  Mean latency: {np.mean(latencies):.1f}ms")
        summary.append(f"  Median latency: {np.median(latencies):.1f}ms")
        summary.append(f"  P95 latency: {sorted(latencies)[int(len(latencies)*0.95)]:.1f}ms")
        summary.append(f"  Max latency: {max(latencies):.1f}ms")
        within = sum(1 for l in latencies if l < 5000)
        summary.append(f"  Within 5s target: {within}/{len(latencies)} ({within/len(latencies)*100:.1f}%)")

    summary_text = "\n".join(summary)
    print(summary_text)

    with open(os.path.join(output_dir, "summary.txt"), "w") as f:
        f.write(summary_text)
    print(f"\nSaved summary to {os.path.join(output_dir, 'summary.txt')}")


def main():
    args = parse_args()
    os.makedirs(args.output_dir, exist_ok=True)

    packets_off = load_csv(args.hpo_off) if args.hpo_off else []
    packets_on = load_csv(args.hpo_on) if args.hpo_on else []
    latency_data = load_csv(args.latency) if args.latency else []

    print("Generating evaluation charts...\n")

    if packets_off and packets_on:
        plot_size_distribution(packets_off, packets_on, args.output_dir)
        plot_timing_distribution(packets_off, packets_on, args.output_dir)
        plot_traffic_timeline(packets_off, packets_on, args.output_dir)

    if latency_data:
        plot_latency(latency_data, args.output_dir)

    generate_summary(packets_off, packets_on, latency_data, args.output_dir)


if __name__ == "__main__":
    main()
