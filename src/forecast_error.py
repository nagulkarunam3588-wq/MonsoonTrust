
import pandas as pd


def calculate_forecast_error(data):
    """
    Calculate the difference between forecast
    rainfall and observed rainfall.

    Required columns:
    forecast_rainfall
    observed_rainfall
    """

    data = data.copy()

    required_columns = [
        "forecast_rainfall",
        "observed_rainfall"
    ]

    # Validate required columns
    for column in required_columns:
        if column not in data.columns:
            raise ValueError(
                f"Required column missing: {column}"
            )

    # Convert rainfall values into numeric format
    for column in required_columns:
        data[column] = pd.to_numeric(
            data[column],
            errors="coerce"
        )

    # Reject missing or invalid rainfall values
    if data[required_columns].isnull().any().any():
        raise ValueError(
            "Missing or invalid rainfall values found."
        )

    if (data[required_columns] < 0).any().any():
        raise ValueError(
            "Rainfall values cannot be negative."
        )

    # Calculate absolute forecast error
    data["absolute_error"] = (
        data["forecast_rainfall"]
        - data["observed_rainfall"]
    ).abs()

    # Calculate signed forecast error
    data["signed_error"] = (
        data["forecast_rainfall"]
        - data["observed_rainfall"]
    )

    return data


if __name__ == "__main__":
    print("MONSOON Forecast Error Module")
    print("Module loaded successfully.")
