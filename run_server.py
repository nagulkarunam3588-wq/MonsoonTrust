"""
MonsoonTrust - Server Startup Script
Launches the FastAPI backend and interactive research dashboard.
"""

import sys
import os
import socket
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return False
        except OSError:
            return True

def get_best_port(default_port: int = 8000, host: str = "127.0.0.1") -> int:
    # If explicitly passed via env (e.g. Render cloud), honor it
    if "PORT" in os.environ:
        return int(os.environ["PORT"])
    # Otherwise check if default port is available, or find the next open port
    port = default_port
    while is_port_in_use(port, host) and port < default_port + 20:
        port += 1
    return port

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    port = get_best_port(8000, "127.0.0.1" if host == "127.0.0.1" else "0.0.0.0")
    
    print("\n" + "=" * 65)
    print("  MONSOONTRUST — AI Rainfall Forecast Reliability System")
    print("=" * 65)
    print(f"  * Status: Server starting on http://{host}:{port}")
    print(f"  * Project Root: {PROJECT_ROOT}")
    print(f"  * Research Study Region: Tamil Nadu, India")
    print(f"  * Research Tolerance: <= 2.5 mm")
    print(f"  * Trained Model: temporal_model.pkl (RandomForestClassifier)")
    print(f"  * Evaluation Dataset: 16,700 matched records")
    print("=" * 65 + "\n")
    
    uvicorn.run("backend.main:app", host=host, port=port, log_level="info", reload=False)
