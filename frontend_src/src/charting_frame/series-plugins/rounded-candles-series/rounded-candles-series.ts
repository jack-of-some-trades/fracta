import {
	CandlestickData,
	CandlestickSeriesOptions,
	CustomData,
	CustomSeriesOptions,
	CustomSeriesPricePlotValues,
	ICustomSeriesPaneView,
	PaneRendererCustomData,
	SeriesPartialOptions,
	Time,
	WhitespaceData,
	customSeriesDefaultOptions,
} from 'lightweight-charts';
import { RoundedCandleSeriesRenderer } from './renderer';

export interface RoundedCandleSeriesData extends CandlestickData, CustomData {
	rounded?: boolean;
}

export type RoundedCandleSeriesPartialOptions = SeriesPartialOptions<RoundedCandleSeriesOptions>;

export interface RoundedCandleSeriesOptions extends CustomSeriesOptions, Omit<CandlestickSeriesOptions, 'borderVisible' | 'borderColor' | 'borderUpColor' | 'borderDownColor'> {
	radius: (barSpacing: number) => number;
}

const defaultOptions: RoundedCandleSeriesOptions = {
	...customSeriesDefaultOptions,
	upColor: '#26a69a',
	downColor: '#ef5350',
	wickVisible: true,
	wickColor: '#737375',
	wickUpColor: '#26a69a',
	wickDownColor: '#ef5350',
	radius: function (bs: number) {
		if (bs < 4) return 0;
		return bs / 3;
	},
} as const;

export class RoundedCandleSeriesImpl<TData extends RoundedCandleSeriesData>
	implements ICustomSeriesPaneView<Time, TData, RoundedCandleSeriesOptions> {
	_renderer: RoundedCandleSeriesRenderer<TData>;

	constructor() {
		this._renderer = new RoundedCandleSeriesRenderer();
	}

	priceValueBuilder(plotRow: TData): CustomSeriesPricePlotValues {
		return [plotRow.high, plotRow.low, plotRow.close];
	}

	renderer(): RoundedCandleSeriesRenderer<TData> {
		return this._renderer;
	}

	isWhitespace(data: TData | WhitespaceData): data is WhitespaceData {
		return (data as Partial<TData>).close === undefined;
	}

	update(
		data: PaneRendererCustomData<Time, TData>,
		options: RoundedCandleSeriesOptions
	): void {
		this._renderer.update(data, options);
	}

	defaultOptions() {
		return defaultOptions;
	}
}
