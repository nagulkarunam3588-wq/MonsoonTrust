
import pandas as pd


def clean_weather_data(data):
    """
    Clean and validate a weather dataset.
    """

    if data.empty:
        raise ValueError("The dataset is empty.")

    # Remove duplicate records
    data = data.drop_duplicates().copy()

    # Remove leading and trailing spaces from column names
    data.columns = data.columns.str.strip()

    # Replace infinite values with missing values
    data = data.replace([float("inf"), float("-inf")], pd.NA)

    # Report missing values
    missing_values = data.isnull().sum()

    print("Weather Data Preprocessing")
    print("--------------------------")
    print(f"Total records: {len(data)}")
    print(f"Duplicate records removed: Completed")
    print("\nMissing values per column:")
    print(missing_values)

    return data


if __name__ == "__main__":
    print("MONSOON Preprocessing Module")
    print("Module loaded successfully.")

