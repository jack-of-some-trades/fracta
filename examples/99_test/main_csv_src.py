"Simple Main script to run Fracta sourcing data from local csv files."

import asyncio

import csv_reader as csv
import pandas as pd

import fracta as fta


async def main():
    """
    Main Function for creating a Window. While the implementation of this is largely
    left for the user, there should be two constants: The Function is Async and called
    from a [ if __name__ == "__main__": ] block.

    The window internally runs a loop manager that handles a return queue. This loop manager
    is run using async/await hence the need for main() to be an async function.

    The Loop that is managed is a multi-process Queue that receives feedback commands
    from the window. The spawning of a child process is what necessitates
    the use of a [ if __name__ == "__main__": ] block.
    """

    server = fta.FractaServer(log_level="INFO", debug=True)
    server.events.data_request += csv.data_request_handler
    server.events.symbol_search += csv.symbol_search_handler
    server.events.open_socket += csv.socket_request_handler

    server.set_search_filters(
        {
            "asset_class": ["Crypto", "Equity"],
            "source": ["Local", "Alpaca"],
            "exchange": [],
        }
    )
    server.set_layout_favs(
        [
            fta.Layouts.SINGLE,
            fta.Layouts.DOUBLE_VERT,
            fta.Layouts.TRIPLE_VERT_LEFT,
            fta.Layouts.QUAD_SQ_H,
        ]
    )
    server.set_series_favs(
        [
            fta.SeriesType.Candlestick,
            fta.SeriesType.Rounded_Candle,
            fta.SeriesType.Line,
            fta.SeriesType.Area,
        ]
    )
    server.set_timeframes(
        favs=[fta.TF(1, "m"), fta.TF(5, "m"), fta.TF(30, "m")],
    )

    window = server.new_window()
    main_frame = window.container(0).frame(0)
    df = pd.read_csv("examples/data/ohlcv.csv")

    if isinstance(main_frame, fta.ChartingFrame):
        main_frame.timeseries.ticker = fta.Ticker("FRACTA", name="Update by Bar Test", exchange="NASDAQ")
        main_frame.timeseries.set_data(df)

        sma20 = fta.indicators.SMA(main_frame)
        fta.indicators.SMA(sma20)

    await server.serve()  # Useful to make Ctrl-C in the terminal kill the window.


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
