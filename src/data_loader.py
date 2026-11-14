
from pathlib import Path
import pandas as pd


# Get the main MONSOON project directory
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Define the locations of our datasets
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"


def load_csv(filename):
    """
    Load a CSV dataset from the raw data directory.
    """

    file_path = RAW_DATA_DIR / filename

    if not file_path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {file_path}"
        )

    try:
        data = pd.read_csv(file_path)
        print(f"Successfully loaded: {filename}")
        print(f"Number of records: {len(data)}")

        return data

    except Exception as error:
        raise RuntimeError(
            f"Error loading {filename}: {error}"
        )


if __name__ == "__main__":
    print("MONSOON Data Loader")
    print("-------------------")
    print(f"Project directory: {PROJECT_ROOT}")
    print(f"Raw data directory: {RAW_DATA_DIR}")
