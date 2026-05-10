import re
import json
from typing import List, Dict, Any


# ============================================================
# 1️⃣ CLEAN SPECIAL TOKENS
# ============================================================

def clean_special_tokens(text: str) -> str:
    """
    Remove model-specific special tokens but preserve structured tags.
    """
    # Remove common HF chat artifacts
    text = re.sub(r"<\|im_start\|>.*?(\n|$)", "", text)
    text = re.sub(r"<\|im_end\|>", "", text)
    text = re.sub(r"<\|assistant\|>", "", text)
    text = re.sub(r"<\|user\|>", "", text)

    # Remove stray leading/trailing whitespace
    return text.strip()


# ============================================================
# 2️⃣ PARSE THINKING
# ============================================================

def parse_reasoning(text: str):
    """
    Extract <think> blocks.
    Supports:
        - Multiple think blocks
        - Broken/incomplete blocks (stream-safe)
    """

    reasoning_blocks = []

    # Complete blocks
    complete_pattern = r"<think>(.*?)</think>"
    for match in re.finditer(complete_pattern, text, re.DOTALL):
        reasoning_blocks.append(match.group(1).strip())

    # Handle open block (no closing tag)
    if "<think>" in text and "</think>" not in text:
        open_pattern = r"<think>(.*)"
        match = re.search(open_pattern, text, re.DOTALL)
        if match:
            reasoning_blocks.append(match.group(1).strip())

    # Remove reasoning from text
    text = re.sub(complete_pattern, "", text, flags=re.DOTALL)
    text = re.sub(r"<think>.*", "", text, flags=re.DOTALL)

    return reasoning_blocks, text.strip()


# ============================================================
# 3️⃣ PARSE TOOL CALLS
# ============================================================

def parse_tool_calls(text: str):
    """
    Extract <tool_call> JSON </tool_call>
    Handles:
        - Multiple calls
        - Missing closing tag
        - Invalid JSON
    """

    tool_calls = []

    # Fix truncated tool_call
    if "<tool_call>" in text and "</tool_call>" not in text:
        text += "</tool_call>"

    pattern = r"<tool_call>(.*?)</tool_call>"

    for match in re.finditer(pattern, text, re.DOTALL):
        raw = match.group(1).strip()

        try:
            parsed = json.loads(raw)
            tool_calls.append({
                "name": parsed.get("name"),
                "arguments": parsed.get("arguments", {}),
                "raw": raw
            })
        except json.JSONDecodeError:
            tool_calls.append({
                "error": "Invalid JSON",
                "raw": raw
            })

    # Remove tool blocks
    text = re.sub(pattern, "", text, flags=re.DOTALL)

    return tool_calls, text.strip()


# ============================================================
# 4️⃣ MASTER PARSER
# ============================================================

def parse_model_output(text: str) -> Dict[str, Any]:
    """
    Master parser:
        - Clean tokens
        - Extract reasoning
        - Extract tool calls
        - Return structured output
    """

    original_text = text

    text = clean_special_tokens(text)

    reasoning, text = parse_reasoning(text)
    tool_calls, text = parse_tool_calls(text)

    final_answer = text.strip()

    return {
        "raw_output": original_text,
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "final_answer": final_answer
    }
