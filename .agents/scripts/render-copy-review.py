from pathlib import Path

import pymupdf


pdf_path = Path(".agents/outputs/MaydanGo-Partner-Portal-Copy-Review.pdf")
output_dir = Path(".agents/outputs/partner-portal-copy-review-preview")
output_dir.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(pdf_path)
page_indexes = sorted({0, 1, document.page_count // 2, document.page_count - 1})

for index in page_indexes:
    page = document[index]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), alpha=False)
    output_path = output_dir / f"page-{index + 1:02}.png"
    pixmap.save(output_path)
    print(output_path)

print(f"Rendered {len(page_indexes)} of {document.page_count} pages for visual review.")
