
import pandas as pd


def create_reliability_labels(data, error_threshold=10.0):
    """
    Label forecasts based on absolute rainfall error.

    A forecast is labelled:
    1 = Meets the selected error tolerance
    0 = Does not meet the selected error tolerance

    The 10 mm threshold is an initial experimental
    setting, not a scientifically validated standard.
    """

    data = data.copy()

    if "absolute_error" not in data.columns:
        raise ValueError(
            "Calculate forecast errors before creating labels."
        )

    if data["absolute_error"].isnull().any():
        raise ValueError("Missing forecast errors found.")

    if error_threshold <= 0:
        raise ValueError("Error threshold must be positive.")

    data["reliable_label"] = (
        data["absolute_error"] <= error_threshold
    ).astype(int)

    print("Reliability Labels Created")
    print("--------------------------")
    print(data["reliable_label"].value_counts())

    return data


if __name__ == "__main__":
    print("MONSOON Reliability Label Module")
    print("Module loaded successfully.")
