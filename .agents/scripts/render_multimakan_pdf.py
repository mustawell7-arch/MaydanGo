from pathlib import Path

import pymupdf


SOURCE = Path("attached_assets/Multi_makan_events_1792926709671.pdf")
OUTPUT = Path(".agents/outputs/multimakan-pages")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    document = pymupdf.open(SOURCE)
    matrix = pymupdf.Matrix(2, 2)

    for page_number, page in enumerate(document, start=1):
        image = page.get_pixmap(matrix=matrix, alpha=False)
        image.save(OUTPUT / f"page-{page_number:03}.png")

    print(f"Rendered {document.page_count} pages to {OUTPUT}")


if __name__ == "__main__":
    main()
