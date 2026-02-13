from gradio_client import Client, handle_file
import json
import sys
import os

# Suppress Gradio's output
os.environ['GRADIO_ANALYTICS_ENABLED'] = 'False'

def transcribe_audio(audio_path):
    try:
        # Suppress stdout temporarily
        original_stdout = sys.stdout
        sys.stdout = open(os.devnull, 'w')
        
        client = Client("http://10.67.18.2:8057/")
        result = client.predict(
            x=handle_file(audio_path),
            api_name="/lambda"
        )
        
        # Restore stdout
        sys.stdout.close()
        sys.stdout = original_stdout
        
        # Print the raw result
        print(result)
    except Exception as e:
        # Restore stdout in case of error
        if sys.stdout != original_stdout:
            sys.stdout.close()
            sys.stdout = original_stdout
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Please provide audio file path"}, ensure_ascii=False))
        sys.exit(1)
    transcribe_audio(sys.argv[1]) 