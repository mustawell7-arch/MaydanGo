from pathlib import Path
import fitz

doc = fitz.open("attached_assets/Multi_makan_events_1792926709671.pdf")
out = Path("/tmp/maydango-spec")
out.mkdir(exist_ok=True)
text = "\n".join(f"\n--- Page {i+1} ---\n{p.get_text()}" for i, p in enumerate(doc))
(out / "spec.txt").write_text(text)
doc[0].get_pixmap(matrix=fitz.Matrix(1, 1)).save(str(out / "page-1.png"))
print(f"{len(doc)} pages; text at {out}/spec.txt")
