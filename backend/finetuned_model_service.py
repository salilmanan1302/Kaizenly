
import json
import re
import threading
from pathlib import Path

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel


# Model configuration
BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ADAPTER_PATH = PROJECT_ROOT / "models" / "kaizenly-lora-v1"

SYSTEM_PROMPT = """You are Kaizenly, an academic assignment feedback assistant.
Evaluate the student's answer using the question, reference answer,
and marking scheme.

Return valid JSON with these fields:
- score: integer (0, 1, or 2)
- performance: Incorrect, Partially Correct, or Correct
- feedback: explanation of the evaluation

Use the provided reference answer and rationale.
Do not invent information or award unsupported marks."""

PERFORMANCE_LABELS = {
    0: "Incorrect",
    1: "Partially Correct",
    2: "Correct"
}

# Lazy loading: model loads only when first requested
_tokenizer = None
_model = None
_model_lock = threading.Lock()


def load_model():
    global _tokenizer, _model

    if _model is not None:
        return _tokenizer, _model

    with _model_lock:
        if _model is not None:
            return _tokenizer, _model

        if not ADAPTER_PATH.exists():
            raise FileNotFoundError(
                f"Kaizenly V1 adapter not found: {ADAPTER_PATH}"
            )

        print("Loading Kaizenly V1 on CPU...")

        _tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=True
        )

        _model = PeftModel.from_pretrained(
            base_model,
            str(ADAPTER_PATH)
        )

        _model.to("cpu")
        _model.eval()

        print("Kaizenly V1 loaded successfully!")

    return _tokenizer, _model


def clean_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1:
        raise ValueError("Model did not return a JSON object.")

    return json.loads(text[start:end + 1])


def generate_feedback(
    question: str,
    student_answer: str,
    reference_answer: str,
    mark_scheme: str
):
    tokenizer, model = load_model()

    user_prompt = f"""Question:
{question}

Student Answer:
{student_answer}

Reference Answer:
{reference_answer}

Mark Scheme:
{mark_scheme}"""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    # Match the training notebook's prompt formatting
    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    inputs = tokenizer(
        prompt,
        return_tensors="pt"
    )

    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=180,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id
        )

    generated_tokens = outputs[0][inputs["input_ids"].shape[1]:]

    response = tokenizer.decode(
        generated_tokens,
        skip_special_tokens=True
    )

    result = clean_json(response)

    score = result.get("score")

    if isinstance(score, bool) or not isinstance(score, int) or score not in (0, 1, 2):
        raise ValueError("Model returned an invalid score.")

    return {
        "score": score,
        "performance": PERFORMANCE_LABELS[score],
        "feedback": str(result.get("feedback", "")).strip()
    }
