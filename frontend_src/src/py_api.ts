//Typescript API that interfaces with python.

import { indicator_pkg } from "../tsx/window/topbar/indicators_menu";
import { Series_Type } from "./charting_frame/series-plugins/series-base";
import { ticker } from "./types";
import { Container_Layouts } from "./window/layouts";


/**
 * API class for frontend → backend (Python) communication via HTTP.
 * Also contains callback stubs that are populated by Python → JS commands.
 */
export class PyApi {
    private baseUrl = window.location.origin;
    /* ---------------- Javascript >>> Python (via HTTP) ---------------- */

    add_container() {
        fetch(`${this.baseUrl}/api/container`, { method: "POST" });
    }

    remove_container(id: string) {
        fetch(`${this.baseUrl}/api/container/${id}`, { method: "DELETE" });
    }

    remove_frame(container_id: string, frame_id: string) {
        fetch(`${this.baseUrl}/api/frame/${container_id}/${frame_id}`, { method: "DELETE" });
    }

    reorder_containers(from: number, to: number) {
        fetch(`${this.baseUrl}/api/reorder_containers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from, to })
        });
    }

    layout_change(container_id: string, layout: Container_Layouts) {
        fetch(`${this.baseUrl}/api/layout_change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, layout })
        });
    }

    series_change(container_id: string, frame_id: string, series_type: Series_Type) {
        fetch(`${this.baseUrl}/api/series_change`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, frame_id, series_type })
        });
    }

    symbol_search(symbol: string, sources: string[], exchanges: string[], asset_classes: string[], confirmed: boolean) {
        fetch(`${this.baseUrl}/api/symbol_search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, sources, exchanges, asset_classes, confirmed })
        });
    }

    timeseries_request(container_id: string, frame_id: string, ticker: ticker, tf: string) {
        fetch(`${this.baseUrl}/api/timeseries_request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, frame_id, ticker, tf })
        });
    }

    indicator_request(container_id: string, frame_id: string, pkg_key: string, ind_key: string) {
        fetch(`${this.baseUrl}/api/indicator_request`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, frame_id, pkg_key, ind_key })
        });
    }

    set_indicator_options(container_id: string, frame_id: string, ind_id: string, obj: Object) {
        fetch(`${this.baseUrl}/api/set_indicator_options`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, frame_id, ind_id, options: obj })
        });
    }

    update_series_options(container_id: string, frame_id: string, ind_id: string, ser_id: string, opts: any) {
        fetch(`${this.baseUrl}/api/update_series_options`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, frame_id, ind_id, ser_id, options: opts })
        });
    }

    update_primitive_options(container_id: string, frame_id: string, par_id: string, prim_id: string, opts: any) {
        fetch(`${this.baseUrl}/api/update_primitive_options`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ container_id, frame_id, par_id, prim_id, options: opts })
        });
    }

    /* ---------------- Python >>> Javascript (via WebSocket) ---------------- */
    // The following functions are called by Python via WebSocket. 
    // They are stubs that get populated by the actual UI components.

    populate_search_tickers(items: ticker[]) { }
    set_search_filters(category: string, opts: string[]) { }

    populate_indicator_pkgs(packages: { [key: string]: indicator_pkg }) { }

    update_series_topbar_opts(opts: any) { console.log('Series opts:', opts) }
    update_layout_topbar_opts(opts: any) { console.log('Layout opts:', opts) }
    update_timeframe_topbar_opts(opts: any) { console.log('Timeframe opts:', opts) }

    set_user_colors(opts: string[]) { }
}