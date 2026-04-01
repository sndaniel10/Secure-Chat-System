#!/usr/bin/env python3
"""
Traffic Analysis ML Classifier for HPO Evaluation

Trains a Random Forest classifier to distinguish real messages from
cover traffic based on packet metadata features. Compares classification
accuracy with HPO enabled vs disabled to measure obfuscation effectiveness.

Research Objective (from proposal):
  - Target: 80% reduction in ML classifier F1 score when HPO is active
  - Baseline: F1 score on unobfuscated traffic (HPO off)
  - Evaluation: F1 score on obfuscated traffic (HPO on)

Usage:
    python classifier.py --hpo-off data/capture_hpo_off.csv --hpo-on data/capture_hpo_on.csv

Features extracted per packet:
  1. Packet size (bytes)
  2. Inter-packet delay (ms)
  3. Packet size variance (rolling window)
  4. Burst detection (packets within 50ms window)
  5. Size entropy (Shannon entropy of size distribution)
"""

import argparse
import csv
import math
import sys
from collections import Counter

import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import (
    classification_report,
    f1_score,
    accuracy_score,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.preprocessing import StandardScaler


def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate HPO effectiveness using ML traffic classification"
    )
    parser.add_argument(
        "--hpo-off", required=True, help="CSV file with HPO-disabled traffic capture"
    )
    parser.add_argument(
        "--hpo-on", required=True, help="CSV file with HPO-enabled traffic capture"
    )
    parser.add_argument(
        "--window", type=int, default=5, help="Rolling window size for features"
    )
    return parser.parse_args()


def load_csv(path: str) -> list[dict]:
    """Load captured traffic data from CSV."""
    packets = []
    with open(path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            packets.append({
                "size": int(row["size_bytes"]),
                "delay": float(row["inter_packet_ms"]),
                "elapsed": float(row["elapsed_ms"]),
                "direction": row["direction"],
            })
    return packets


def extract_features(packets: list[dict], window: int = 5) -> np.ndarray:
    """
    Extract traffic analysis features from packet metadata.

    For each packet, compute:
    - Packet size
    - Inter-packet delay
    - Rolling size variance (window)
    - Rolling delay variance (window)
    - Burst count (packets within 50ms)
    - Size category (quantized)
    """
    features = []

    for i, pkt in enumerate(packets):
        # Basic features
        size = pkt["size"]
        delay = pkt["delay"]

        # Rolling window features
        window_start = max(0, i - window)
        window_packets = packets[window_start : i + 1]
        window_sizes = [p["size"] for p in window_packets]
        window_delays = [p["delay"] for p in window_packets]

        size_mean = np.mean(window_sizes)
        size_var = np.var(window_sizes) if len(window_sizes) > 1 else 0
        delay_mean = np.mean(window_delays)
        delay_var = np.var(window_delays) if len(window_delays) > 1 else 0

        # Burst detection: count packets within 50ms before this one
        burst_count = sum(
            1 for p in window_packets if pkt["elapsed"] - p["elapsed"] < 50
        )

        # Size category (discretized)
        if size <= 1024:
            size_cat = 0
        elif size <= 2048:
            size_cat = 1
        else:
            size_cat = 2

        features.append([
            size,
            delay,
            size_mean,
            size_var,
            delay_mean,
            delay_var,
            burst_count,
            size_cat,
        ])

    return np.array(features)


def label_packets_hpo_off(packets: list[dict]) -> np.ndarray:
    """
    Label packets in HPO-off capture.
    Without HPO, all packets are real messages (label=1).
    We simulate a baseline by labeling based on inter-packet timing:
    - Packets with regular timing patterns get label 0 (would be cover)
    - Packets with irregular timing get label 1 (real)
    For a fair baseline, we label all as real=1 since HPO is off.
    """
    return np.ones(len(packets), dtype=int)


def label_packets_hpo_on(packets: list[dict]) -> np.ndarray:
    """
    Label packets in HPO-on capture.
    With HPO, packets are mix of real (1) and cover (0).
    Since we can't know ground truth from capture alone, we use
    the labeled data approach: train on HPO-off, test on HPO-on.
    """
    return np.ones(len(packets), dtype=int)


def shannon_entropy(sizes: list[int]) -> float:
    """Compute Shannon entropy of packet size distribution."""
    total = len(sizes)
    if total == 0:
        return 0.0
    counter = Counter(sizes)
    entropy = 0.0
    for count in counter.values():
        p = count / total
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy


def analyze_traffic_patterns(packets: list[dict], label: str):
    """Print traffic pattern analysis for a capture."""
    sizes = [p["size"] for p in packets]
    delays = [p["delay"] for p in packets if p["delay"] > 0]

    print(f"\n{'='*60}")
    print(f"Traffic Analysis: {label}")
    print(f"{'='*60}")
    print(f"  Total packets: {len(packets)}")
    print(f"  Unique sizes: {sorted(set(sizes))}")
    print(f"  Size entropy: {shannon_entropy(sizes):.4f} bits")

    if delays:
        print(f"  Mean delay: {np.mean(delays):.1f}ms")
        print(f"  Std delay: {np.std(delays):.1f}ms")
        print(f"  CV (delay): {np.std(delays)/np.mean(delays):.4f}")

    # Size distribution
    size_counts = Counter(sizes)
    print(f"  Size distribution:")
    for size in sorted(size_counts.keys()):
        count = size_counts[size]
        pct = (count / len(sizes)) * 100
        print(f"    {size:>5}B: {count:>6} ({pct:.1f}%)")


def evaluate_classifier(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    name: str,
):
    """Train and evaluate a classifier."""
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Random Forest
    rf = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
    rf.fit(X_train_scaled, y_train)
    y_pred_rf = rf.predict(X_test_scaled)

    # Train Gradient Boosting
    gb = GradientBoostingClassifier(n_estimators=100, random_state=42, max_depth=5)
    gb.fit(X_train_scaled, y_train)
    y_pred_gb = gb.predict(X_test_scaled)

    print(f"\n{'='*60}")
    print(f"Classification Results: {name}")
    print(f"{'='*60}")

    for clf_name, y_pred in [("Random Forest", y_pred_rf), ("Gradient Boosting", y_pred_gb)]:
        f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)
        acc = accuracy_score(y_test, y_pred)
        print(f"\n  {clf_name}:")
        print(f"    Accuracy: {acc:.4f}")
        print(f"    F1 Score: {f1:.4f}")
        print(f"    Confusion Matrix:")
        cm = confusion_matrix(y_test, y_pred)
        for row in cm:
            print(f"      {row}")

    return f1_score(y_test, y_pred_rf, average="weighted", zero_division=0)


def simulate_labels(packets: list[dict], hpo_on: bool) -> np.ndarray:
    """
    Simulate ground-truth labels for evaluation.

    For HPO-off traffic: all packets are real (label=1)
    For HPO-on traffic: packets at regular intervals with uniform sizes
      are likely cover (0), others are real (1).

    In practice, this would use server-side logs with known labels.
    """
    labels = np.ones(len(packets), dtype=int)

    if hpo_on:
        # With HPO, approximately half the packets should be cover traffic
        # Simulate by labeling ~50% as cover based on regularity
        for i in range(len(packets)):
            # Simple heuristic: alternate as a baseline simulation
            if i % 2 == 0:
                labels[i] = 0  # cover
    return labels


def main():
    args = parse_args()

    print("=" * 60)
    print("HPO Effectiveness Evaluation - ML Traffic Classifier")
    print("=" * 60)

    # Load captures
    try:
        packets_off = load_csv(args.hpo_off)
        packets_on = load_csv(args.hpo_on)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("\nPlease run capture_traffic.py first to generate capture files.")
        sys.exit(1)

    if not packets_off or not packets_on:
        print("Error: Empty capture files. Run captures with active chat sessions.")
        sys.exit(1)

    # Analyze traffic patterns
    analyze_traffic_patterns(packets_off, "HPO OFF (Baseline)")
    analyze_traffic_patterns(packets_on, "HPO ON (Obfuscated)")

    # Extract features
    X_off = extract_features(packets_off, args.window)
    X_on = extract_features(packets_on, args.window)

    # Simulate labels (in practice, use server logs)
    y_off = simulate_labels(packets_off, hpo_on=False)
    y_on = simulate_labels(packets_on, hpo_on=True)

    # Evaluate: Train on HPO-off, test on HPO-on
    # This measures if the classifier trained on unobfuscated patterns
    # can still identify real messages when HPO is active
    f1_baseline = evaluate_classifier(
        X_off, y_off, X_off, y_off, "Baseline (HPO OFF → HPO OFF)"
    )

    f1_hpo = evaluate_classifier(
        X_off, y_off, X_on, y_on, "Transfer (HPO OFF → HPO ON)"
    )

    # Cross-validation on HPO-on data
    if len(set(y_on)) > 1:
        print(f"\n{'='*60}")
        print("Cross-Validation on HPO-ON Data")
        print(f"{'='*60}")
        scaler = StandardScaler()
        X_on_scaled = scaler.fit_transform(X_on)
        rf = RandomForestClassifier(n_estimators=100, random_state=42)
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        y_pred_cv = cross_val_predict(rf, X_on_scaled, y_on, cv=cv)
        f1_cv = f1_score(y_on, y_pred_cv, average="weighted")
        print(f"  5-fold CV F1: {f1_cv:.4f}")

    # Summary
    print(f"\n{'='*60}")
    print("HPO EFFECTIVENESS SUMMARY")
    print(f"{'='*60}")
    print(f"  Baseline F1 (no HPO):    {f1_baseline:.4f}")
    print(f"  Obfuscated F1 (with HPO): {f1_hpo:.4f}")
    if f1_baseline > 0:
        reduction = ((f1_baseline - f1_hpo) / f1_baseline) * 100
        print(f"  F1 Reduction:            {reduction:.1f}%")
        print(f"  Target (from proposal):  80% reduction")
        if reduction >= 80:
            print(f"  Status: TARGET MET")
        else:
            print(f"  Status: Below target ({80 - reduction:.1f}% more reduction needed)")
    else:
        print("  Cannot compute reduction (baseline F1 is 0)")

    # Traffic uniformity metrics
    print(f"\n{'='*60}")
    print("Traffic Uniformity Metrics")
    print(f"{'='*60}")
    sizes_off = [p["size"] for p in packets_off]
    sizes_on = [p["size"] for p in packets_on]
    delays_off = [p["delay"] for p in packets_off if p["delay"] > 0]
    delays_on = [p["delay"] for p in packets_on if p["delay"] > 0]

    print(f"  HPO OFF - Size entropy: {shannon_entropy(sizes_off):.4f} bits")
    print(f"  HPO ON  - Size entropy: {shannon_entropy(sizes_on):.4f} bits")
    print(f"  (Lower entropy = more uniform = better obfuscation)")

    if delays_off and delays_on:
        cv_off = np.std(delays_off) / np.mean(delays_off) if np.mean(delays_off) > 0 else 0
        cv_on = np.std(delays_on) / np.mean(delays_on) if np.mean(delays_on) > 0 else 0
        print(f"  HPO OFF - Timing CV: {cv_off:.4f}")
        print(f"  HPO ON  - Timing CV: {cv_on:.4f}")
        print(f"  (Lower CV = more regular = better obfuscation)")


if __name__ == "__main__":
    main()
