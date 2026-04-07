"""
Parse assets/result.txt (markdown tables) into a long-form DataFrame and save CSV.

Columns: query_type, metric, model, attractor, score
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def parse_result_markdown(text: str) -> pd.DataFrame:
    lines = text.splitlines()
    query_type: str | None = None
    metric: str | None = None
    records: list[dict[str, object]] = []

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        if line.startswith("# ") and not line.startswith("##"):
            query_type = line[2:].strip()
            i += 1
            continue

        if line.startswith("## "):
            metric = line[3:].strip()
            i += 1
            continue

        stripped = line.strip()
        if stripped.startswith("|") and "attractor" in stripped.lower():
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if not cells or cells[0].lower() != "attractor":
                i += 1
                continue
            models = cells[1:]
            i += 1
            if i < n and lines[i].strip().startswith("|:"):
                i += 1
            while i < n:
                row_line = lines[i]
                rs = row_line.strip()
                if not rs or not rs.startswith("|"):
                    break
                if rs.startswith("|:"):
                    i += 1
                    continue
                parts = [c.strip() for c in row_line.split("|")[1:-1]]
                if len(parts) < 1 + len(models):
                    i += 1
                    continue
                attractor = parts[0]
                score_cells = parts[1 : 1 + len(models)]
                if query_type is None or metric is None:
                    i += 1
                    continue
                for model, s in zip(models, score_cells):
                    try:
                        score = float(s)
                    except ValueError:
                        continue
                    records.append(
                        {
                            "query_type": query_type,
                            "metric": metric,
                            "model": model,
                            "attractor": attractor,
                            "score": score,
                        }
                    )
                i += 1
            continue

        i += 1

    return pd.DataFrame.from_records(
        records,
        columns=["query_type", "metric", "model", "attractor", "score"],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse result.txt to CSV.")
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=Path(__file__).resolve().parent / "result.txt",
        help="Path to result markdown file",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "result_parsed.csv",
        help="Output CSV path",
    )
    args = parser.parse_args()

    text = args.input.read_text(encoding="utf-8")
    df = parse_result_markdown(text)
    df.to_csv(args.output, index=False, encoding="utf-8")
    print(f"Wrote {len(df)} rows to {args.output}")


if __name__ == "__main__":
    main()
