import re
from typing import Literal

LanguageCode = Literal["eng", "hin"]


def process_markdown(text: str) -> str:
    """Format markdown for web display (keep ** for bold, etc.)."""
    if not text:
        return text
    # Normalize list spacing
    text = re.sub(r"^\s*[-*]\s+(.*)$", r"\n• \1\n", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*(\d+)\.\s+(.*)$", r"\n\1. \2\n", text, flags=re.MULTILINE)
    # Devanagari line breaks
    text = re.sub(r"([।॥])", r"\1\n", text)
    # Space URLs for clickability
    text = re.sub(r"(https?://[^\s]+)", r"\n\1\n", text)
    text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text)
    return text.strip()


def extract_product_info(text: str, language: LanguageCode) -> tuple[list[dict], str]:
    """Extract product blocks (name, price, link, imageUrl) and remaining text."""
    patterns = {
        "eng": {
            "name": r"\*\*(.*?)\*\*",
            "price": r"Price:\s*₹?(\d+)",
            "link": r"\[Product Link\]\((.*?)\)",
            "thumbnail": r"!\[Thumbnail\]\((.*?)\)",
        },
        "hin": {
            "name": r"\*\*(.*?)\*\*",
            "price": r"कीमत:\s*₹?(\d+)",
            "link": r"\[उत्पाद लिंक\]\((.*?)\)",
            "thumbnail": r"!\[थंबनेल\]\((.*?)\)",
        },
    }
    p = patterns.get(language, patterns["eng"])
    # Combined product block: **Name** \n - Price: ... \n - [Link](...) \n - ![Thumb](...)
    product_re = re.compile(
        rf"{p['name']}\s*\n\s*-\s*{p['price']}\s*\n\s*-\s*{p['link']}\s*\n\s*-\s*{p['thumbnail']}",
        re.MULTILINE | re.DOTALL,
    )
    products = []
    last_end = 0
    for m in product_re.finditer(text):
        products.append({
            "name": m.group(1),
            "price": m.group(2),
            "link": m.group(3),
            "imageUrl": m.group(4),
        })
        last_end = m.end()
    remaining = text[last_end:].strip()
    return products, remaining
