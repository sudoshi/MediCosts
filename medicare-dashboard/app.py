#!/usr/bin/env python3
"""
Medicare Inpatient Hospitals Dashboard
======================================
Shows average price of services by zip code for the 50 most expensive hospitalizations.

Data source: CMS Medicare Inpatient Hospitals - by Provider and Service
Release Year 2025, Data Year 2023
https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals/medicare-inpatient-hospitals-by-provider-and-service
"""

import os
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dash import Dash, html, dcc, callback, Input, Output, dash_table

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
DATA_PATH = os.path.join(os.path.dirname(__file__), "MUP_INP_RY25_DY23_PrvSvc.csv")

print("Loading data …")
df = pd.read_csv(
    DATA_PATH,
    encoding="latin-1",
    dtype={
        "Rndrng_Prvdr_CCN": str,
        "Rndrng_Prvdr_Zip5": str,
        "Rndrng_Prvdr_State_FIPS": str,
        "DRG_Cd": str,
    },
)

# Ensure numeric columns
for col in ["Tot_Dschrgs", "Avg_Submtd_Cvrd_Chrg", "Avg_Tot_Pymt_Amt", "Avg_Mdcr_Pymt_Amt"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

# Create a short DRG label for display
df["DRG_Label"] = df["DRG_Cd"] + " – " + df["DRG_Desc"].str[:80]

# ---------------------------------------------------------------------------
# Identify the 50 most expensive DRGs (by weighted average total payment)
# Weight by number of discharges so high-volume DRGs aren't under-represented
# ---------------------------------------------------------------------------
def _drg_agg(g):
    denom = g["Tot_Dschrgs"].sum()
    denom = denom if denom and denom > 0 else 1
    return pd.Series(
        {
            "Weighted_Avg_Pymt": (g["Avg_Tot_Pymt_Amt"] * g["Tot_Dschrgs"]).sum() / denom,
            "Weighted_Avg_Chrg": (g["Avg_Submtd_Cvrd_Chrg"] * g["Tot_Dschrgs"]).sum() / denom,
            "Weighted_Avg_Medicare": (g["Avg_Mdcr_Pymt_Amt"] * g["Tot_Dschrgs"]).sum() / denom,
            "Total_Discharges": int(g["Tot_Dschrgs"].sum()),
            "Num_Providers": int(g["Rndrng_Prvdr_CCN"].nunique()),
        }
    )

drg_stats = (
    df.groupby(["DRG_Cd", "DRG_Desc", "DRG_Label"])
    .apply(_drg_agg, include_groups=False)
    .reset_index()
    .sort_values("Weighted_Avg_Pymt", ascending=False)
)

top50 = drg_stats.head(50)
top50_codes = set(top50["DRG_Cd"])

# Filter data to only the top 50 DRGs
df_top50 = df[df["DRG_Cd"].isin(top50_codes)].copy()

# Aggregate by zip code across all top-50 DRGs
zip_agg = (
    df_top50.groupby(["Rndrng_Prvdr_Zip5", "Rndrng_Prvdr_State_Abrvtn", "Rndrng_Prvdr_City"])
    .agg(
        Avg_Total_Payment=("Avg_Tot_Pymt_Amt", "mean"),
        Avg_Covered_Charge=("Avg_Submtd_Cvrd_Chrg", "mean"),
        Avg_Medicare_Payment=("Avg_Mdcr_Pymt_Amt", "mean"),
        Total_Discharges=("Tot_Dschrgs", "sum"),
        Num_DRGs=("DRG_Cd", "nunique"),
        Num_Providers=("Rndrng_Prvdr_CCN", "nunique"),
    )
    .reset_index()
    .sort_values("Avg_Total_Payment", ascending=False)
)

print(f"Loaded {len(df):,} rows, {len(top50_codes)} top DRGs, {len(zip_agg):,} zip codes")

# ---------------------------------------------------------------------------
# Build Dash App
# ---------------------------------------------------------------------------
app = Dash(__name__)
app.title = "Medicare Inpatient – 50 Most Expensive Hospitalizations"

# DRG dropdown options (sorted by cost descending)
drg_options = [{"label": "All 50 Most Expensive DRGs (combined)", "value": "ALL"}] + [
    {"label": row["DRG_Label"], "value": row["DRG_Cd"]}
    for _, row in top50.iterrows()
]

app.layout = html.Div(
    style={"fontFamily": "'Segoe UI', Roboto, sans-serif", "margin": "0 auto", "maxWidth": "1400px", "padding": "20px"},
    children=[
        # Header
        html.Div(
            style={"background": "linear-gradient(135deg, #1a5276, #2e86c1)", "borderRadius": "12px", "padding": "30px", "marginBottom": "24px", "color": "white"},
            children=[
                html.H1("Medicare Inpatient Hospital Pricing Dashboard", style={"margin": "0 0 8px 0", "fontSize": "28px"}),
                html.P(
                    "Average price of services by ZIP code for the 50 most expensive hospitalizations",
                    style={"margin": "0 0 4px 0", "opacity": "0.9", "fontSize": "16px"},
                ),
                html.P(
                    "Source: CMS Medicare Inpatient Hospitals – by Provider and Service (Data Year 2023, Released May 2025)",
                    style={"margin": 0, "opacity": "0.7", "fontSize": "13px"},
                ),
            ],
        ),
        # Summary cards
        html.Div(
            style={"display": "grid", "gridTemplateColumns": "repeat(4, 1fr)", "gap": "16px", "marginBottom": "24px"},
            children=[
                _card(label, value)
                for label, value in [
                    ("Top 50 DRGs", f"{len(top50_codes):,}"),
                    ("ZIP Codes", f"{len(zip_agg):,}"),
                    ("Total Discharges", f"{int(df_top50['Tot_Dschrgs'].sum()):,}"),
                    (
                        "Highest Avg Payment",
                        f"${top50['Weighted_Avg_Pymt'].iloc[0]:,.0f}",
                    ),
                ]
            ],
        )
        if False
        else html.Div(
            id="summary-cards",
            style={"display": "grid", "gridTemplateColumns": "repeat(4, 1fr)", "gap": "16px", "marginBottom": "24px"},
        ),
        # Controls
        html.Div(
            style={"background": "#f8f9fa", "borderRadius": "10px", "padding": "20px", "marginBottom": "24px"},
            children=[
                html.Label("Select DRG (Diagnosis Related Group):", style={"fontWeight": "600", "marginBottom": "8px", "display": "block"}),
                dcc.Dropdown(
                    id="drg-selector",
                    options=drg_options,
                    value="ALL",
                    clearable=False,
                    style={"marginBottom": "16px"},
                ),
                html.Label("Price metric:", style={"fontWeight": "600", "marginBottom": "8px", "display": "block"}),
                dcc.RadioItems(
                    id="metric-selector",
                    options=[
                        {"label": " Average Total Payment", "value": "Avg_Tot_Pymt_Amt"},
                        {"label": " Average Covered Charges (billed)", "value": "Avg_Submtd_Cvrd_Chrg"},
                        {"label": " Average Medicare Payment", "value": "Avg_Mdcr_Pymt_Amt"},
                    ],
                    value="Avg_Tot_Pymt_Amt",
                    inline=True,
                    style={"display": "flex", "gap": "24px"},
                ),
            ],
        ),
        # Row 1: Top 50 DRGs bar chart
        html.Div(
            style={"background": "white", "borderRadius": "10px", "padding": "20px", "marginBottom": "24px", "boxShadow": "0 1px 3px rgba(0,0,0,0.1)"},
            children=[
                html.H3("Top 50 Most Expensive DRGs by Average Total Payment", style={"marginTop": 0}),
                dcc.Graph(id="top50-bar"),
            ],
        ),
        # Row 2: Map & table side by side
        html.Div(
            style={"display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "24px", "marginBottom": "24px"},
            children=[
                html.Div(
                    style={"background": "white", "borderRadius": "10px", "padding": "20px", "boxShadow": "0 1px 3px rgba(0,0,0,0.1)"},
                    children=[
                        html.H3("Average Price by State", style={"marginTop": 0}),
                        dcc.Graph(id="state-map"),
                    ],
                ),
                html.Div(
                    style={"background": "white", "borderRadius": "10px", "padding": "20px", "boxShadow": "0 1px 3px rgba(0,0,0,0.1)"},
                    children=[
                        html.H3("Price Distribution", style={"marginTop": 0}),
                        dcc.Graph(id="price-histogram"),
                    ],
                ),
            ],
        ),
        # Row 3: Top ZIP codes table
        html.Div(
            style={"background": "white", "borderRadius": "10px", "padding": "20px", "marginBottom": "24px", "boxShadow": "0 1px 3px rgba(0,0,0,0.1)"},
            children=[
                html.H3("Top 50 ZIP Codes by Average Price", style={"marginTop": 0}),
                html.Div(id="zip-table-container"),
            ],
        ),
        # Row 4: Scatter plot – charges vs payments
        html.Div(
            style={"background": "white", "borderRadius": "10px", "padding": "20px", "marginBottom": "24px", "boxShadow": "0 1px 3px rgba(0,0,0,0.1)"},
            children=[
                html.H3("Charges vs. Payments by ZIP Code", style={"marginTop": 0}),
                dcc.Graph(id="scatter-plot"),
            ],
        ),
        # Footer
        html.Div(
            style={"textAlign": "center", "padding": "20px", "color": "#888", "fontSize": "12px"},
            children=[
                html.P("Data: CMS Medicare Inpatient Hospitals – by Provider and Service, Data Year 2023"),
                html.P("Prices reflect averages across providers within each ZIP code."),
            ],
        ),
    ],
)


# ---------------------------------------------------------------------------
# Helper: summary card
# ---------------------------------------------------------------------------
def make_card(label, value):
    return html.Div(
        style={
            "background": "white",
            "borderRadius": "10px",
            "padding": "20px",
            "boxShadow": "0 1px 3px rgba(0,0,0,0.1)",
            "textAlign": "center",
        },
        children=[
            html.Div(value, style={"fontSize": "28px", "fontWeight": "700", "color": "#1a5276"}),
            html.Div(label, style={"fontSize": "13px", "color": "#666", "marginTop": "4px"}),
        ],
    )


# Build summary cards on load
@callback(Output("summary-cards", "children"), Input("drg-selector", "value"))
def update_summary_cards(selected_drg):
    if selected_drg == "ALL":
        subset = df_top50
    else:
        subset = df_top50[df_top50["DRG_Cd"] == selected_drg]

    total_discharges = int(subset["Tot_Dschrgs"].sum())
    num_providers = subset["Rndrng_Prvdr_CCN"].nunique()
    num_zips = subset["Rndrng_Prvdr_Zip5"].nunique()

    # Weighted average payment
    wavg = (subset["Avg_Tot_Pymt_Amt"] * subset["Tot_Dschrgs"]).sum() / max(subset["Tot_Dschrgs"].sum(), 1)

    return [
        make_card("Avg Total Payment", f"${wavg:,.0f}"),
        make_card("Total Discharges", f"{total_discharges:,}"),
        make_card("Providers", f"{num_providers:,}"),
        make_card("ZIP Codes", f"{num_zips:,}"),
    ]


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------
@callback(Output("top50-bar", "figure"), Input("metric-selector", "value"))
def update_top50_bar(metric):
    metric_map = {
        "Avg_Tot_Pymt_Amt": "Weighted_Avg_Pymt",
        "Avg_Submtd_Cvrd_Chrg": "Weighted_Avg_Chrg",
        "Avg_Mdcr_Pymt_Amt": "Weighted_Avg_Medicare",
    }
    col = metric_map.get(metric, "Weighted_Avg_Pymt")
    data = (
        top50.sort_values(col, ascending=True)
        .tail(50)
        .copy()
        .reset_index(drop=True)
    )
    # Ensure numeric column is plain float for Plotly
    data = data.assign(**{col: data[col].astype("float64")})

    label_map = {
        "Weighted_Avg_Pymt": "Avg Total Payment ($)",
        "Weighted_Avg_Chrg": "Avg Covered Charges ($)",
        "Weighted_Avg_Medicare": "Avg Medicare Payment ($)",
    }

    fig = px.bar(
        data,
        x=col,
        y="DRG_Label",
        orientation="h",
        color=col,
        color_continuous_scale="YlOrRd",
        labels={col: label_map.get(col, col), "DRG_Label": "DRG"},
        hover_data={"Total_Discharges": ":,", "Num_Providers": ":,"},
    )
    fig.update_layout(
        height=900,
        margin=dict(l=20, r=20, t=20, b=20),
        coloraxis_showscale=False,
        yaxis=dict(tickfont=dict(size=10)),
        xaxis=dict(tickprefix="$", tickformat=","),
    )
    return fig


def _get_zip_data(selected_drg, metric):
    """Aggregate data by ZIP for the selected DRG(s)."""
    if selected_drg == "ALL":
        subset = df_top50
    else:
        subset = df_top50[df_top50["DRG_Cd"] == selected_drg]

    agg = (
        subset.groupby(["Rndrng_Prvdr_Zip5", "Rndrng_Prvdr_State_Abrvtn", "Rndrng_Prvdr_City"])
        .agg(
            Avg_Price=(metric, "mean"),
            Total_Discharges=("Tot_Dschrgs", "sum"),
            Num_Providers=("Rndrng_Prvdr_CCN", "nunique"),
        )
        .reset_index()
        .sort_values("Avg_Price", ascending=False)
    )
    return agg


@callback(Output("state-map", "figure"), Input("drg-selector", "value"), Input("metric-selector", "value"))
def update_state_map(selected_drg, metric):
    if selected_drg == "ALL":
        subset = df_top50
    else:
        subset = df_top50[df_top50["DRG_Cd"] == selected_drg]

    state_agg = (
        subset.groupby("Rndrng_Prvdr_State_Abrvtn")
        .agg(
            Avg_Price=(metric, "mean"),
            Total_Discharges=("Tot_Dschrgs", "sum"),
            Num_Providers=("Rndrng_Prvdr_CCN", "nunique"),
        )
        .reset_index()
    )

    label_map = {
        "Avg_Tot_Pymt_Amt": "Avg Total Payment",
        "Avg_Submtd_Cvrd_Chrg": "Avg Covered Charges",
        "Avg_Mdcr_Pymt_Amt": "Avg Medicare Payment",
    }

    fig = px.choropleth(
        state_agg,
        locations="Rndrng_Prvdr_State_Abrvtn",
        locationmode="USA-states",
        color="Avg_Price",
        color_continuous_scale="YlOrRd",
        scope="usa",
        labels={"Avg_Price": label_map.get(metric, metric), "Rndrng_Prvdr_State_Abrvtn": "State"},
        hover_data={"Total_Discharges": ":,", "Num_Providers": ":,"},
    )
    fig.update_layout(
        margin=dict(l=0, r=0, t=0, b=0),
        coloraxis_colorbar=dict(tickprefix="$", tickformat=","),
        geo=dict(bgcolor="rgba(0,0,0,0)"),
    )
    return fig


@callback(Output("price-histogram", "figure"), Input("drg-selector", "value"), Input("metric-selector", "value"))
def update_histogram(selected_drg, metric):
    data = _get_zip_data(selected_drg, metric)

    label_map = {
        "Avg_Tot_Pymt_Amt": "Avg Total Payment ($)",
        "Avg_Submtd_Cvrd_Chrg": "Avg Covered Charges ($)",
        "Avg_Mdcr_Pymt_Amt": "Avg Medicare Payment ($)",
    }

    fig = px.histogram(
        data,
        x="Avg_Price",
        nbins=40,
        labels={"Avg_Price": label_map.get(metric, metric)},
        color_discrete_sequence=["#2e86c1"],
    )
    fig.update_layout(
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(tickprefix="$", tickformat=","),
        yaxis_title="Number of ZIP Codes",
        bargap=0.05,
    )
    return fig


@callback(Output("zip-table-container", "children"), Input("drg-selector", "value"), Input("metric-selector", "value"))
def update_zip_table(selected_drg, metric):
    data = _get_zip_data(selected_drg, metric).head(50)

    label_map = {
        "Avg_Tot_Pymt_Amt": "Avg Total Payment",
        "Avg_Submtd_Cvrd_Chrg": "Avg Covered Charges",
        "Avg_Mdcr_Pymt_Amt": "Avg Medicare Payment",
    }

    table_data = data.rename(
        columns={
            "Rndrng_Prvdr_Zip5": "ZIP Code",
            "Rndrng_Prvdr_State_Abrvtn": "State",
            "Rndrng_Prvdr_City": "City",
            "Avg_Price": label_map.get(metric, "Avg Price"),
            "Total_Discharges": "Total Discharges",
            "Num_Providers": "Providers",
        }
    )

    price_col = label_map.get(metric, "Avg Price")
    table_data[price_col] = table_data[price_col].apply(lambda x: f"${x:,.0f}")
    table_data["Total Discharges"] = table_data["Total Discharges"].apply(lambda x: f"{int(x):,}")

    return dash_table.DataTable(
        data=table_data.to_dict("records"),
        columns=[{"name": c, "id": c} for c in table_data.columns],
        style_table={"overflowX": "auto"},
        style_cell={"textAlign": "left", "padding": "10px", "fontSize": "13px"},
        style_header={"backgroundColor": "#1a5276", "color": "white", "fontWeight": "bold"},
        style_data_conditional=[
            {"if": {"row_index": "odd"}, "backgroundColor": "#f8f9fa"},
        ],
        page_size=20,
        sort_action="native",
    )


@callback(Output("scatter-plot", "figure"), Input("drg-selector", "value"), Input("metric-selector", "value"))
def update_scatter(selected_drg, _metric):
    if selected_drg == "ALL":
        subset = df_top50
    else:
        subset = df_top50[df_top50["DRG_Cd"] == selected_drg]

    zip_scatter = (
        subset.groupby(["Rndrng_Prvdr_Zip5", "Rndrng_Prvdr_State_Abrvtn", "Rndrng_Prvdr_City"])
        .agg(
            Avg_Charges=("Avg_Submtd_Cvrd_Chrg", "mean"),
            Avg_Payment=("Avg_Tot_Pymt_Amt", "mean"),
            Total_Discharges=("Tot_Dschrgs", "sum"),
        )
        .reset_index()
    )

    fig = px.scatter(
        zip_scatter,
        x="Avg_Charges",
        y="Avg_Payment",
        size="Total_Discharges",
        color="Rndrng_Prvdr_State_Abrvtn",
        hover_data={
            "Rndrng_Prvdr_Zip5": True,
            "Rndrng_Prvdr_City": True,
            "Total_Discharges": ":,",
            "Avg_Charges": ":$,.0f",
            "Avg_Payment": ":$,.0f",
        },
        labels={
            "Avg_Charges": "Avg Covered Charges ($)",
            "Avg_Payment": "Avg Total Payment ($)",
            "Rndrng_Prvdr_State_Abrvtn": "State",
            "Rndrng_Prvdr_Zip5": "ZIP",
            "Rndrng_Prvdr_City": "City",
        },
        size_max=20,
        opacity=0.6,
    )
    fig.update_layout(
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(tickprefix="$", tickformat=","),
        yaxis=dict(tickprefix="$", tickformat=","),
        showlegend=False,
        height=500,
    )
    # Add 1:1 reference line
    max_val = max(zip_scatter["Avg_Charges"].max(), zip_scatter["Avg_Payment"].max())
    fig.add_trace(
        go.Scatter(
            x=[0, max_val],
            y=[0, max_val],
            mode="lines",
            line=dict(dash="dash", color="gray", width=1),
            showlegend=False,
            hoverinfo="skip",
        )
    )
    return fig


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("DASH_PORT", 8051))
    print(f"\n✦ Dashboard ready at http://127.0.0.1:{port}\n")
    app.run(debug=True, port=port)
