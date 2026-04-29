"""Restore a shuffled DingXiang slider background from a local image + seed."""

from __future__ import annotations

import argparse
import os

from captcha_fetcher import restore_background


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore a local shuffled bg.webp using the original p1 seed.")
    parser.add_argument("image", help="Path to shuffled background image, e.g. bg.webp")
    parser.add_argument("--seed", required=True, help="Original p1 basename without extension")
    parser.add_argument("--output", help="Output PNG path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    with open(args.image, "rb") as f:
        restored, ranges = restore_background(f.read(), args.seed)

    output = args.output or f"{os.path.splitext(args.image)[0]}_restored.png"
    restored.save(output)
    print(f"image: {args.image}")
    print(f"seed: {args.seed}")
    print(f"ranges: {ranges}")
    print(f"output: {output}")


if __name__ == "__main__":
    main()
