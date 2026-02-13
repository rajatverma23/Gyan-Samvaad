import base64

def wav_to_base64_file(wav_path: str, output_path: str):
    with open(wav_path, "rb") as f:
        audio_bytes = f.read()

    b64_audio = base64.b64encode(audio_bytes).decode("utf-8")

    with open(output_path, "w", encoding="utf-8") as out:
        out.write(b64_audio)

# Example usage
wav_to_base64_file("ref_audio_new.wav", "ref_audio_base64")