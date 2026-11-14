
import numpy as np
import pandas as pd


def engineer_features(data):
    """
    Create machine-learning features from forecast-time data.

    Required columns:
    forecast_issue_time
    valid_time
    """

    data = data.copy()

    required_columns = [
        "forecast_issue_time",
        "valid_time"
    ]

    # Check whether required columns exist
    for column in required_columns:
        if column not in data.columns:
            raise ValueError(
                f"Required column missing: {column}"
            )

    # Convert timestamps into datetime format
    data["forecast_issue_time"] = pd.to_datetime(
        data["forecast_issue_time"],
        errors="coerce"
    )

    data["valid_time"] = pd.to_datetime(
        data["valid_time"],
        errors="coerce"
    )

    # Check for invalid timestamps
    if data[required_columns].isnull().any().any():
        raise ValueError(
            "Invalid or missing forecast timestamps found."
        )

    # Calculate forecast lead time in days
    data["lead_time_days"] = (
        data["valid_time"] - data["forecast_issue_time"]
    ).dt.total_seconds() / 86400

    if (data["lead_time_days"] < 0).any():
        raise ValueError(
            "Valid time cannot be earlier than forecast issue time."
        )

    # Extract calendar information
    data["forecast_month"] = data["valid_time"].dt.month
    data["forecast_day_of_year"] = (
        data["valid_time"].dt.dayofyear
    )

    # Represent seasonal patterns numerically
    data["season_sin"] = np.sin(
        2 * np.pi * data["forecast_day_of_year"] / 365.25
    )

    data["season_cos"] = np.cos(
        2 * np.pi * data["forecast_day_of_year"] / 365.25
    )

    return data


if __name__ == "__main__":
    print("MONSOON Feature Engineering Module")
    print("Module loaded successfully.")
