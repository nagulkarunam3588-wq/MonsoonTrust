
from pathlib import Path

from data_loader import load_csv
from preprocessing import clean_weather_data
from feature_engineering import engineer_features
from forecast_error import calculate_forecast_error
from reliability_label import create_reliability_labels


def prepare_dataset():

    print("\nMONSOON DATA PREPARATION")
    print("========================")

    # Step 1: Load historical data
    data = load_csv("historical_rainfall.csv")

    # Step 2: Clean the dataset
    data = clean_weather_data(data)

    # Step 3: Generate weather features
    data = engineer_features(data)

    # Step 4: Calculate forecast errors
    data = calculate_forecast_error(data)

    # Step 5: Generate reliability labels
    data = create_reliability_labels(data)

    # Step 6: Save the prepared dataset
    project_root = Path(__file__).resolve().parent.parent
    output_path = (
        project_root / "data" / "processed"
        / "reliability_dataset.csv"
    )

    data.to_csv(output_path, index=False)

    print("\nDataset preparation completed.")
    print(f"Saved dataset: {output_path}")


if __name__ == "__main__":
    prepare_dataset()
