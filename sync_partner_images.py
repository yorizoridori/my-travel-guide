"""나우다 제휴사 페이지의 대표 이미지를 images.js로 동기화한다."""

from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


GALLERY_DIR = Path(__file__).resolve().parent
DATA_PATH = GALLERY_DIR / "data.js"
OUTPUT_PATH = GALLERY_DIR / "images.js"
IMAGE_PATTERN = re.compile(
    r'<div[^>]+class="poi-image".*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"',
    re.IGNORECASE | re.DOTALL,
)


def load_partners() -> list[dict]:
    text = DATA_PATH.read_text(encoding="utf-8")
    return json.loads(text.split("=", 1)[1].strip().removesuffix(";"))


def fetch_image(partner: dict) -> tuple[int, dict | None, str | None]:
    source_url = partner["sourceUrl"]
    request = urllib.request.Request(
        source_url,
        headers={"User-Agent": "Mozilla/5.0 NOWDA partner image sync"},
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            page = response.read().decode("utf-8", "replace")
        match = IMAGE_PATTERN.search(page)
        if not match:
            return partner["id"], None, "대표 이미지 없음"
        image_url = urllib.parse.urljoin(source_url, html.unescape(match.group(1)))
        image_alt = html.unescape(match.group(2)).strip() or f'{partner["name"]} 대표 사진'
        return partner["id"], {
            "imageUrl": image_url,
            "imageAlt": image_alt,
            "imageSourceLabel": "비짓제주 나우다",
            "imageSourceUrl": source_url,
        }, None
    except Exception as error:  # 개별 실패가 전체 동기화를 막지 않도록 기록한다.
        return partner["id"], None, str(error)


def main() -> None:
    partners = load_partners()
    images: dict[int, dict] = {}
    failures: list[tuple[int, str]] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(fetch_image, partner) for partner in partners]
        for future in as_completed(futures):
            partner_id, image, error = future.result()
            if image:
                images[partner_id] = image
            else:
                failures.append((partner_id, error or "알 수 없는 오류"))

    ordered = {partner_id: images[partner_id] for partner_id in sorted(images)}
    OUTPUT_PATH.write_text(
        "window.NOWDA_IMAGES = " + json.dumps(ordered, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(json.dumps({"partners": len(partners), "images": len(images), "failures": failures}, ensure_ascii=False))


if __name__ == "__main__":
    main()
