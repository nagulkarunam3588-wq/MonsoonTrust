"""
MonsoonTrust - Server Startup Script
Launches the FastAPI backend and interactive research dashboard.
"""

import sys
import os
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0" if "PORT" in os.environ else "127.0.0.1")
    
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
