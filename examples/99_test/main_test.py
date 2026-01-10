"Simple Main Script to launch Fracta sourcing data from the Alpaca API"

import sys
import asyncio
from dotenv import find_dotenv, load_dotenv

import pandas as pd

import fracta as fta


load_dotenv(find_dotenv())


async def main():
    # The Window is about twice as slow to load compared to the CSV main because of the Alpaca API
    # All symbols are loaded at the start and for some reason that API never decided to make that an
    # Async request so here we wait.

    window = fta.Window(log_level="DEBUG", debug=True, frameless=False, broker_api="psyscale")

    window.set_layout_favs(
        [
            fta.Layouts.SINGLE,
            fta.Layouts.DOUBLE_VERT,
            fta.Layouts.TRIPLE_VERT_LEFT,
            fta.Layouts.QUAD_SQ_H,
        ]
    )
    window.set_series_favs(
        [
            fta.SeriesType.Candlestick,
            fta.SeriesType.Rounded_Candle,
            fta.SeriesType.Line,
            fta.SeriesType.Area,
        ]
    )
    window.set_timeframes(
        favs=[fta.TF(1, "m"), fta.TF(5, "m"), fta.TF(30, "m")],
    )

    window.new_tab()
    main_frame = window.container(0).frame(0)
    df = pd.read_csv("examples/data/ohlcv.csv")

    if isinstance(main_frame, fta.ChartingFrame):
        main_frame.timeseries.set_data(df, symbol=fta.Ticker("FRACTA", name="Update by Bar Test", exchange="NASDAQ"))

        # indicators.Volume(main_frame)
        # opts = lwc.indicators.SMA.__options__(period=20)
        sma20 = fta.indicators.SMA(main_frame)
        fta.indicators.SMA(sma20)

    await window.await_close()  # Useful to make Ctrl-C in the terminal kill the window.


if __name__ == "__main__":
    try:
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
