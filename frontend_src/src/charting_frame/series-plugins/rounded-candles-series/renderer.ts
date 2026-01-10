import { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas';
import { ICustomSeriesPaneRenderer, PaneRendererCustomData, PriceToCoordinateConverter, Time } from 'lightweight-charts';
import { candlestickWidth } from '../../helpers/dimensions/candles.js';
import { gridAndCrosshairMediaWidth } from '../../helpers/dimensions/crosshair-width.js';
import { positionsBox, positionsLine } from '../../helpers/dimensions/positions.js';
import { RoundedCandleSeriesData, RoundedCandleSeriesOptions } from './rounded-candles-series.js';

interface BarItem {
	openY: number;
	highY: number;
	lowY: number;
	closeY: number;
	x: number;
	isUp: boolean;
}

export class RoundedCandleSeriesRenderer<TData extends RoundedCandleSeriesData>
	implements ICustomSeriesPaneRenderer {
	_data: PaneRendererCustomData<Time, TData> | null = null;
	_options: RoundedCandleSeriesOptions | null = null;

	draw(
		target: CanvasRenderingTarget2D,
		priceConverter: PriceToCoordinateConverter
	): void {
		target.useBitmapCoordinateSpace(scope =>
			this._drawImpl(scope, priceConverter)
		);
	}

	update(
		data: PaneRendererCustomData<Time, TData>,
		options: RoundedCandleSeriesOptions
	): void {
		this._data = data;
		this._options = options;
		// if (this._data.bars[this._data.bars.length - 1].barColor)
	}

	_drawImpl(
		renderingScope: BitmapCoordinatesRenderingScope,
		priceToCoordinate: PriceToCoordinateConverter
	): void {
		if (
			this._data === null ||
			this._data.bars.length === 0 ||
			this._data.visibleRange === null ||
			this._options === null
		) {
			return;
		}

		const start = this._data.visibleRange.from
		const end = this._data.visibleRange.to

		const vis_bars = this._data.bars.slice(start, end).map(bar => {
			const isUp = bar.originalData.close >= bar.originalData.open;
			const openY = priceToCoordinate(bar.originalData.open as number) ?? 0;
			const highY = priceToCoordinate(bar.originalData.high as number) ?? 0;
			const lowY = priceToCoordinate(bar.originalData.low as number) ?? 0;
			const closeY = priceToCoordinate(bar.originalData.close as number) ?? 0;
			return {
				openY,
				highY,
				lowY,
				closeY,
				x: bar.x,
				isUp,
			};
		});

		// Set the Priceline Color by setting Options.Color. This is handled in LWC's series-bar-colorer.ts -> barStyleFnMap
		// The var isn't used for candle color ironic enough, but this is what LWC internally grabs for the priceLine Color
		if (this._options.priceLineColor !== '') {
			this._options.color = this._options.priceLineColor
		} else {
			// Color Based on the last bar in the series.
			let last_bar = this._data.bars.at(-1)
			let lastIsUp = last_bar ? last_bar.originalData.close >= last_bar.originalData.open : false
			this._options.color = lastIsUp ? this._options.upColor : this._options.downColor
		}


		const radius = this._options.radius(this._data.barSpacing);
		if (this._options.wickVisible)
			this._drawWicks(renderingScope, vis_bars);
		this._drawCandles(renderingScope, vis_bars, radius);
	}

	private _drawWicks(
		renderingScope: BitmapCoordinatesRenderingScope,
		bars: readonly BarItem[]
	): void {
		if (this._data === null || this._options === null) {
			return;
		}

		const {
			context: ctx,
			horizontalPixelRatio,
			verticalPixelRatio,
		} = renderingScope;

		const wickWidth = gridAndCrosshairMediaWidth(horizontalPixelRatio);

		for (const bar of bars) {
			ctx.fillStyle = bar.isUp
				? this._options.wickUpColor
				: this._options.wickDownColor;

			const verticalPositions = positionsBox(bar.lowY, bar.highY, verticalPixelRatio);
			const linePositions = positionsLine(bar.x, horizontalPixelRatio, wickWidth);
			ctx.fillRect(linePositions.position, verticalPositions.position, linePositions.length, verticalPositions.length);
		}
	}

	private _drawCandles(
		renderingScope: BitmapCoordinatesRenderingScope,
		bars: readonly BarItem[],
		radius: number
	): void {
		if (this._data === null || this._options === null) {
			return;
		}

		const {
			context: ctx,
			horizontalPixelRatio,
			verticalPixelRatio,
		} = renderingScope;

		// we want this in media width therefore using 1
		// positionsLine will adjust for pixelRatio
		const candleBodyWidth = candlestickWidth(this._data.barSpacing, 1);

		for (const bar of bars) {
			const verticalPositions = positionsBox(Math.min(bar.openY, bar.closeY), Math.max(bar.openY, bar.closeY), verticalPixelRatio);
			const linePositions = positionsLine(bar.x, horizontalPixelRatio, candleBodyWidth);

			ctx.fillStyle = bar.isUp
				? this._options.upColor
				: this._options.downColor;

			// roundRect might need to polyfilled for older browsers
			if (ctx.roundRect) {
				ctx.beginPath();
				ctx.roundRect(linePositions.position, verticalPositions.position, linePositions.length, verticalPositions.length, radius);
				ctx.fill();
			} else {
				ctx.fillRect(linePositions.position, verticalPositions.position, linePositions.length, verticalPositions.length);
			}
		}
	}
}
