/**
 * WebSocket manager for Python → JavaScript command communication.
 * Modeled after the js_cmd.py rolodex pattern.
 */

import { JS_CMD } from "./types";

type CmdHandler = (...args: any[]) => void;

// Command rolodex maps JS_CMD enum values to handler functions
const CMD_ROLODEX: Map<JS_CMD, CmdHandler> = new Map();

/**
 * Decorator function to register a command handler.
 * Usage: register_js_cmd(JS_CMD.ADD_CONTAINER)((id) => { ... });
 */
export function register_ws_cmd(cmd: JS_CMD) {
    return function (handler: CmdHandler): CmdHandler {
        CMD_ROLODEX.set(cmd, handler);
        return handler;
    };
}


/**
 * WebSocket manager class for handling Python → JavaScript communication.
 */
export class WebSocketManager {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    constructor() {
        this.connect();
    }

    private connect() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = this.onOpen.bind(this);
        this.ws.onmessage = this.onMessage.bind(this);
        this.ws.onclose = this.onClose.bind(this);
        this.ws.onerror = this.onError.bind(this);
    }

    private onOpen() {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
    }

    private onMessage(event: MessageEvent) {
        try {
            const { cmd, payload } = JSON.parse(event.data);
            console.debug("Websocket Payload:", JS_CMD[cmd], payload);

            if (cmd == undefined) {
                console.error("Websocket Payload did not provide command type.", payload);
                return
            }
            if (!Object.values(JS_CMD).includes(cmd as JS_CMD)) {
                console.error("Unknown websocket command type.", payload);
                return
            }

            CMD_ROLODEX.get(cmd)?.(payload);
        } catch (e) {
            console.error("Error handling WebSocket message:", e, event.data);
        }
    }

    private onClose() {
        console.log("WebSocket disconnected");
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
            setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
        }
    }

    private onError(error: Event) {
        console.error("WebSocket error:", error);
    }
}


// #region ------------------------ Window Commands ------------------------ //

register_ws_cmd(JS_CMD.JS_CODE)(
    (...scripts: string[]) => {
        for (const script of scripts) {
            eval(script);
        }
    }
);

register_ws_cmd(JS_CMD.ADD_CONTAINER)(
    (id: string) => {
        window.container_manager.add_container(id);
    }
);

register_ws_cmd(JS_CMD.REMOVE_CONTAINER)(
    (id: string) => {
        window.container_manager.remove_container(id);
    }
);

register_ws_cmd(JS_CMD.REMOVE_REFERENCE)(
    (...ids: string[]) => {
        for (const id of ids) {
            delete (window as any)[id];
        }
    }
);

register_ws_cmd(JS_CMD.UPDATE_TF_FAVS)(
    (opts: any) => {
        window.api.update_timeframe_topbar_opts(opts);
    }
);

register_ws_cmd(JS_CMD.UPDATE_SERIES_FAVS)(
    (opts: any) => {
        window.api.update_series_topbar_opts(opts);
    }
);

register_ws_cmd(JS_CMD.UPDATE_LAYOUT_FAVS)(
    (opts: any) => {
        window.api.update_layout_topbar_opts(opts);
    }
);

register_ws_cmd(JS_CMD.SET_SYMBOL_ITEMS)(
    (tickers: any[]) => {
        window.api.populate_search_tickers(tickers);
    }
);

register_ws_cmd(JS_CMD.SET_SYMBOL_SEARCH_OPTS)(
    (category: string, opts: string[]) => {
        window.api.set_search_filters(category, opts);
    }
);

register_ws_cmd(JS_CMD.SET_USER_COLORS)(
    (opts: string[]) => {
        window.api.set_user_colors(opts);
    }
);

register_ws_cmd(JS_CMD.POPULATE_IND_PKGS)(
    (pkgs: object) => {
        window.api.populate_indicator_pkgs(pkgs as any);
    }
);

register_ws_cmd(JS_CMD.UPDATE_IND_PKG)(
    (pkgKey: string, pkg: object) => {
        window.api.populate_indicator_pkgs({ [pkgKey]: pkg } as any);
    }
);

// #endregion

// #region ------------------------ Container & Frame ------------------------ //

register_ws_cmd(JS_CMD.SET_LAYOUT)(
    (containerId: string, layout: number) => {
        const container = window.container_manager.get_container(containerId);
        container?.set_layout(layout);
    }
);

register_ws_cmd(JS_CMD.ADD_FRAME)(
    (containerId: string, frameId: string, frameType: number) => {
        const container = window.container_manager.get_container(containerId);
        const frame = container?.add_frame(frameId, frameType);
        if (frame) (window as any)[frameId] = frame;
    }
);

register_ws_cmd(JS_CMD.REMOVE_FRAME)(
    (containerId: string, frameId: string) => {
        const container = window.container_manager.get_container(containerId);
        container?.remove_frame(frameId);
    }
);

register_ws_cmd(JS_CMD.ADD_PANE)(
    (frameId: string, paneId: string) => {
        const frame = (window as any)[frameId];
        if (frame?.add_pane) {
            const pane = frame.add_pane(paneId);
            (window as any)[paneId] = pane;
        }
    }
);

// #endregion

// #region ------------------------ Frame Commands ------------------------ //

register_ws_cmd(JS_CMD.SET_FRAME_SERIES_TYPE)(
    (frameId: string, seriesType: number) => {
        const frame = (window as any)[frameId];
        frame?.set_series_type?.(seriesType);
    }
);

register_ws_cmd(JS_CMD.SET_FRAME_SYMBOL)(
    (frameId: string, ticker: object) => {
        const frame = (window as any)[frameId];
        frame?.set_ticker?.(ticker);
    }
);

register_ws_cmd(JS_CMD.SET_FRAME_TIMEFRAME)(
    (frameId: string, timeframe: string) => {
        const frame = (window as any)[frameId];
        frame?.set_timeframe?.(timeframe);
    }
);

register_ws_cmd(JS_CMD.SET_WHITESPACE_DATA)(
    (frameId: string, data: any[], currTime: any) => {
        const frame = (window as any)[frameId];
        frame?.set_whitespace_data?.(data, currTime);
    }
);

register_ws_cmd(JS_CMD.CLEAR_WHITESPACE_DATA)(
    (frameId: string) => {
        const frame = (window as any)[frameId];
        frame?.set_whitespace_data?.([]);
    }
);

register_ws_cmd(JS_CMD.UPDATE_WHITESPACE_DATA)(
    (frameId: string, data: any, currTime: any) => {
        const frame = (window as any)[frameId];
        frame?.update_whitespace_data?.(data, currTime);
    }
);

register_ws_cmd(JS_CMD.AUTOSCALE_TIME_AXIS)(
    (frameId: string) => {
        const frame = (window as any)[frameId];
        frame?.autoscaleContent?.();
    }
);

register_ws_cmd(JS_CMD.CREATE_INDICATOR)(
    (frameId: string, indicatorId: string, indicatorType: string, name: string, outputs: object) => {
        const frame = (window as any)[frameId];
        frame?.create_indicator?.(indicatorId, indicatorType, name, outputs);
    }
);

register_ws_cmd(JS_CMD.REMOVE_INDICATOR)(
    (frameId: string, indicatorId: string) => {
        const frame = (window as any)[frameId];
        frame?.delete_indicator?.(indicatorId);
    }
);

// #endregion

// #region ------------------------ Indicator Commands ------------------------ //

function getIndicator(frameId: string, indicatorId: string): any {
    const frame = (window as any)[frameId];
    return frame?.attached?.get(indicatorId);
}

function getSeries(frameId: string, indicatorId: string, seriesId: string): any {
    const ind = getIndicator(frameId, indicatorId);
    return ind?.series?.get(seriesId);
}

register_ws_cmd(JS_CMD.ADD_SERIES)(
    (frameId: string, indicatorId: string, seriesId: string, seriesType: number, name: string | null) => {
        const ind = getIndicator(frameId, indicatorId);
        ind?.add_series?.(seriesId, seriesType, name);
    }
);

register_ws_cmd(JS_CMD.REMOVE_SERIES)(
    (frameId: string, indicatorId: string, seriesId: string) => {
        const ind = getIndicator(frameId, indicatorId);
        ind?.remove_series?.(seriesId);
    }
);

register_ws_cmd(JS_CMD.SET_LEGEND_LABEL)(
    (frameId: string, indicatorId: string, label: string) => {
        const ind = getIndicator(frameId, indicatorId);
        ind?.setLabel?.(label);
    }
);

register_ws_cmd(JS_CMD.SET_INDICATOR_MENU)(
    (frameId: string, indicatorId: string, menuStruct: any, options: any) => {
        const ind = getIndicator(frameId, indicatorId);
        ind?.set_menu_struct?.(menuStruct, options);
    }
);

register_ws_cmd(JS_CMD.SET_INDICATOR_OPTIONS)(
    (frameId: string, indicatorId: string, options: any) => {
        const ind = getIndicator(frameId, indicatorId);
        ind?.applyOptions?.(options, true);
    }
);

// #endregion

// #region ------------------------ Series Commands ------------------------ //

register_ws_cmd(JS_CMD.SET_SERIES_DATA)(
    (frameId: string, indicatorId: string, seriesId: string, data: any[]) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.setData?.(data);
    }
);

register_ws_cmd(JS_CMD.CLEAR_SERIES_DATA)(
    (frameId: string, indicatorId: string, seriesId: string) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.setData?.([]);
    }
);

register_ws_cmd(JS_CMD.UPDATE_SERIES_DATA)(
    (frameId: string, indicatorId: string, seriesId: string, data: any) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.update?.(data);
    }
);

register_ws_cmd(JS_CMD.CHANGE_SERIES_TYPE)(
    (frameId: string, indicatorId: string, seriesId: string, seriesType: number, data: any[]) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.change_series_type?.(seriesType, data);
    }
);

register_ws_cmd(JS_CMD.UPDATE_SERIES_OPTS)(
    (frameId: string, indicatorId: string, seriesId: string, opts: any) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.applyOptions?.(opts, true);
    }
);

register_ws_cmd(JS_CMD.UPDATE_PRICE_SCALE_OPTS)(
    (frameId: string, indicatorId: string, seriesId: string, opts: any) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.priceScale?.()?.applyOptions?.(opts);
    }
);

// #endregion

// #region ------------------------ Series Markers ------------------------ //

register_ws_cmd(JS_CMD.REMOVE_SERIES_MARKER)(
    (frameId: string, indicatorId: string, seriesId: string, markId: string) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.removeMarker?.(markId);
    }
);

register_ws_cmd(JS_CMD.UPDATE_SERIES_MARKER)(
    (frameId: string, indicatorId: string, seriesId: string, markId: string, marker: any) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.updateMarker?.(markId, marker);
    }
);

register_ws_cmd(JS_CMD.FILTER_SERIES_MARKERS)(
    (frameId: string, indicatorId: string, seriesId: string, markIds: string[]) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.filterMarkers?.(markIds);
    }
);

register_ws_cmd(JS_CMD.REMOVE_ALL_SERIES_MARKERS)(
    (frameId: string, indicatorId: string, seriesId: string) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.removeAllMarkers?.();
    }
);

// #endregion

// #region ------------------------ Series Pricelines ------------------------ //

register_ws_cmd(JS_CMD.ADD_SERIES_PRICELINE)(
    (frameId: string, indicatorId: string, seriesId: string, lineId: string, line: any) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.createPriceLine?.(lineId, line);
    }
);

register_ws_cmd(JS_CMD.REMOVE_SERIES_PRICELINE)(
    (frameId: string, indicatorId: string, seriesId: string, lineId: string) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.removePriceLine?.(lineId);
    }
);

register_ws_cmd(JS_CMD.UPDATE_SERIES_PRICELINE)(
    (frameId: string, indicatorId: string, seriesId: string, lineId: string, line: any) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.updatePriceLine?.(lineId, line);
    }
);

register_ws_cmd(JS_CMD.FILTER_SERIES_PRICELINES)(
    (frameId: string, indicatorId: string, seriesId: string, lineIds: string[]) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.filterPriceLines?.(lineIds);
    }
);

register_ws_cmd(JS_CMD.REMOVE_ALL_SERIES_PRICELINES)(
    (frameId: string, indicatorId: string, seriesId: string) => {
        const ser = getSeries(frameId, indicatorId, seriesId);
        ser?.removeAllPriceLines?.();
    }
);

// #endregion

// #region ------------------------ Primitives ------------------------ //

function getPrimitiveSet(frameId: string, indicatorId: string | null, primitiveSetId: string): any {
    const frame = (window as any)[frameId];
    if (indicatorId === null) {
        return frame?.attached?.get(primitiveSetId);
    } else {
        const ind = frame?.attached?.get(indicatorId);
        return ind?.attached?.get(primitiveSetId);
    }
}

register_ws_cmd(JS_CMD.ADD_PRIMITIVE_SET)(
    (frameId: string, indicatorId: string | null, setId: string, name: string) => {
        const set = getPrimitiveSet(frameId, indicatorId, setId);
        set?.create_primitive_set?.(setId, name);
    }
);

register_ws_cmd(JS_CMD.REMOVE_PRIMITIVE_SET)(
    (frameId: string, indicatorId: string | null, setId: string) => {
        const set = getPrimitiveSet(frameId, indicatorId, setId);
        set?.remove_primitive_set?.(setId);
    }
);

register_ws_cmd(JS_CMD.CREATE_PRIMITIVE)(
    (frameId: string, indicatorId: string | null, primitiveSetId: string, primitiveId: string, primitiveType: string, args: object) => {
        const set = getPrimitiveSet(frameId, indicatorId, primitiveSetId);
        set?.createPrimitive?.(primitiveId, primitiveType, args);
    }
);

register_ws_cmd(JS_CMD.REMOVE_PRIMITIVE)(
    (frameId: string, indicatorId: string | null, primitiveSetId: string, primitiveId: string) => {
        const set = getPrimitiveSet(frameId, indicatorId, primitiveSetId);
        set?.detachPrimitive?.(primitiveId);
    }
);

register_ws_cmd(JS_CMD.UPDATE_PRIMITIVE_OPTS)(
    (frameId: string, indicatorId: string | null, primitiveSetId: string, primitiveId: string, args: object) => {
        const set = getPrimitiveSet(frameId, indicatorId, primitiveSetId);
        set?.updatePrimitive?.(primitiveId, args);
    }
);

// #endregion