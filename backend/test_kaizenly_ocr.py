#!/usr/bin/env python3
"""
Kaizenly OCR smoke test.

Creates sample assignment images automatically and sends them to:
    POST /api/extract-handwriting

Requirements:
    pip install pillow

Run:
    python test_kaizenly_ocr.py

Optional:
    KAIZENLY_API_URL=http://127.0.0.1:8000 python test_kaizenly_ocr.py
    python test_kaizenly_ocr.py --base-url http://127.0.0.1:8000 --keep-images
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import textwrap
import urllib.error
import urllib.request
import uuid
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Missing dependency: Pillow")
    print("Install it with: python -m pip install Pillow")
    sys.exit(2)


SUBJECT = "Data Structures and Algorithms"
ACADEMIC_LEVEL = "Undergraduate"

QUESTION_LINES = [
    "Assignment Question",
    "",
    "Explain the difference between an array and a linked list.",
    "Write two advantages of each data structure.",
]

ANSWER_PAGE_1_LINES = [
    "Answer - Page 1",
    "",
    "An array is a linear data structure that stores elements",
    "in contiguous memory locations. It allows random access",
    "to elements using an index.",
    "",
    "A linked list is a linear data structure in which elements",
    "are stored in separate nodes. Each node contains data",
    "and a pointer to the next node.",
]

ANSWER_PAGE_2_LINES = [
    "Answer - Page 2",
    "",
    "Advantages of arrays:",
    "1. Fast access to elements using an index.",
    "2. Easy traversal of elements.",
    "",
    "Advantages of linked lists:",
    "1. Dynamic memory allocation.",
    "2. Efficient insertion and deletion of nodes.",
]


def choose_font(size: int, bold: bool = False):
    candidates = (
        [
            "C:/Windows/Fonts/arialbd.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
        if bold
        else [
            "C:/Windows/Fonts/arial.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    )
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def create_sample_image(lines: list[str], destination: Path) -> None:
    """Render a clean, high-resolution page image for OCR pipeline testing."""
    width, height = 1500, 1900
    image = Image.new("RGB", (width, height), color="#fffefa")
    draw = ImageDraw.Draw(image)

    title_font = choose_font(48, bold=True)
    body_font = choose_font(37)
    y = 145

    draw.text((125, 75), "KAIZENLY OCR TEST SAMPLE", fill="#777777",
              font=choose_font(22))
    draw.line((125, 120, width - 125, 120), fill="#dddddd", width=3)

    for index, line in enumerate(lines):
        if index == 0:
            font = title_font
            fill = "#222222"
            spacing = 80
        else:
            font = body_font
            fill = "#202020"
            spacing = 67 if line else 34

        if line:
            draw.text((135, y), line, fill=fill, font=font)
        y += spacing

    draw.text((125, height - 100), "Synthetic sample for API testing",
              fill="#999999", font=choose_font(21))
    image.save(destination, format="PNG", optimize=True)


def make_multipart(fields: list[tuple[str, str]],
                   files: list[tuple[str, str, bytes, str]]) -> tuple[bytes, str]:
    boundary = "----KaizenlyBoundary" + uuid.uuid4().hex
    chunks: list[bytes] = []

    for name, value in fields:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode("utf-8"),
            b"\r\n",
        ])

    for field_name, filename, content, mime_type in files:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            (
                f'Content-Disposition: form-data; name="{field_name}"; '
                f'filename="{filename}"\r\n'
            ).encode(),
            f"Content-Type: {mime_type}\r\n\r\n".encode(),
            content,
            b"\r\n",
        ])

    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Kaizenly's OCR API smoke test.")
    parser.add_argument(
        "--base-url",
        default=os.getenv("KAIZENLY_API_URL", "http://127.0.0.1:8000"),
        help="Base URL of the running Kaizenly FastAPI backend.",
    )
    parser.add_argument(
        "--keep-images",
        action="store_true",
        help="Keep the generated PNG test images in a local folder.",
    )
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    endpoint = f"{base_url}/api/extract-handwriting"

    print("\nKAIZENLY — AUTOMATED OCR SMOKE TEST")
    print("=" * 44)
    print(f"Backend:  {base_url}")
    print(f"Endpoint: {endpoint}")
    print("\nGenerating synthetic test images...")

    if args.keep_images:
        image_dir = Path.cwd() / "kaizenly_ocr_test_images"
        image_dir.mkdir(parents=True, exist_ok=True)
        cleanup_dir = None
    else:
        cleanup_dir = tempfile.TemporaryDirectory(prefix="kaizenly_ocr_")
        image_dir = Path(cleanup_dir.name)

    question_path = image_dir / "question.png"
    answer1_path = image_dir / "answer_page_1.png"
    answer2_path = image_dir / "answer_page_2.png"

    try:
        create_sample_image(QUESTION_LINES, question_path)
        create_sample_image(ANSWER_PAGE_1_LINES, answer1_path)
        create_sample_image(ANSWER_PAGE_2_LINES, answer2_path)

        print("  Created: question image")
        print("  Created: answer page 1")
        print("  Created: answer page 2")

        fields = [
            ("subject", SUBJECT),
            ("academic_level", ACADEMIC_LEVEL),
        ]
        files = [
            ("question_image", question_path.name, question_path.read_bytes(), "image/png"),
            ("answer_images", answer1_path.name, answer1_path.read_bytes(), "image/png"),
            ("answer_images", answer2_path.name, answer2_path.read_bytes(), "image/png"),
        ]
        body, content_type = make_multipart(fields, files)

        request = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": content_type, "Accept": "application/json"},
            method="POST",
        )

        print("\nUploading 1 question image + 2 answer pages...")
        print("Waiting for Groq Vision. This may take a little while.\n")

        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                status = response.status
                raw_response = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            print(f"FAIL — API returned HTTP {error.code}")
            print(detail)
            return 1
        except urllib.error.URLError as error:
            print("FAIL — Could not reach the backend.")
            print(f"Reason: {error.reason}")
            print("Check that FastAPI is running and the base URL is correct.")
            return 1

        print(f"HTTP status: {status}")
        try:
            result = json.loads(raw_response)
        except json.JSONDecodeError:
            print("FAIL — Backend did not return valid JSON.")
            print(raw_response[:2000])
            return 1

        required = {"subject", "academic_level", "question", "answer",
                    "pages_processed", "review_required", "message"}
        missing = required - result.keys()
        if missing:
            print(f"FAIL — Response is missing fields: {sorted(missing)}")
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 1

        question_text = str(result["question"])
        answer_text = str(result["answer"])
        combined = (question_text + "\n" + answer_text).lower()

        print("\nQUESTION TRANSCRIPTION")
        print("-" * 44)
        print(question_text)

        print("\nANSWER TRANSCRIPTION")
        print("-" * 44)
        print(answer_text)

        checks = {
            "Question mentions array": "array" in question_text.lower(),
            "Question mentions linked list": "linked list" in question_text.lower(),
            "Answer mentions contiguous memory": "contiguous" in answer_text.lower(),
            "Answer mentions random access": "random access" in answer_text.lower(),
            "Answer mentions dynamic allocation": "dynamic memory" in answer_text.lower(),
            "Answer mentions insertion/deletion": (
                "insertion" in answer_text.lower() and "deletion" in answer_text.lower()
            ),
            "Both answer pages were processed": result["pages_processed"] == 2,
            "Review is required": result["review_required"] is True,
        }

        print("\nVALIDATION CHECKS")
        print("-" * 44)
        for label, passed in checks.items():
            print(f"{'PASS' if passed else 'CHECK'}  {label}")

        print("\nAPI message:", result["message"])
        failures = [label for label, passed in checks.items() if not passed]

        if failures:
            print("\nRESULT: API responded, but some OCR checks need manual review.")
            print("Check these items:", "; ".join(failures))
            return 1

        print("\nRESULT: OCR SMOKE TEST PASSED.")
        print("The endpoint accepted both answer pages and returned reviewable text.")
        print(
            "\nNote: These are clean synthetic printed-text images. "
            "This validates the upload/API/vision pipeline, not real-world "
            "handwriting accuracy."
        )
        return 0

    finally:
        if cleanup_dir is not None:
            cleanup_dir.cleanup()
        elif args.keep_images:
            print(f"\nGenerated images kept at: {image_dir.resolve()}")


if __name__ == "__main__":
    raise SystemExit(main())
