//Typescript API that interfaces with python.

import { indicator_pkg } from "../tsx/window/topbar/indicators_menu";
import { Series_Type } from "./charting_frame/series-plugins/series-base";
import { makeId, ticker } from "./types";
import { Container_Layouts, num_frames } from "./window/layouts";


//Each Function Maps directly to a function within the js_api class in js_api.py
export class py_api {
    close!: () => void;
    maximize!: () => void;
    minimize!: () => void;
    restore!: () => void;

    /* ---------------- Javascript >>> Python ---------------- */
    // The following functions are called by JS and hook to functions implemented in python.
    // These functions have default commands so functionality is maintained when launched on a local dev server.
    // These are over written (re-routed) at start-up by the Python View Class so they execute their respective python functions

    exec_py = (kwargs:object) => console.log(`Exec_Py given kwargs: ${kwargs}`)
    
    // @ts-ignore                                    
    add_container = () => window.container_manager.add_container(makeId(Array.from(container_manager.containers.keys()), 'c_'));
    // @ts-ignore
    remove_container = (id: string) => window.container_manager.remove_container(id);
    // @ts-ignore
    remove_frame = (container_id: string, frame_id:string) => activeContainer.remove_frame(frame_id)
    reorder_containers = (from: number, to: number) => {
        console.log(`reorder containers from: ${from} to: ${to} `)
    }

    layout_change = (container_id: string, layout: Container_Layouts) => {
        console.log(`Layout Change: ${container_id},${layout}`)
        //@ts-ignore
        const container = window.container_manager.containers.get(container_id)
        if (container === undefined) return

        //Make the neccessary frames
        for(let i = container.frames.length; i<num_frames(container.layout); i++)
            //@ts-ignore
            container.add_frame(makeId(Array.from(container.frames, frame=>frame.id), `${container_id}_f_`))

        //change the layout 
        //@ts-ignore
        container.set_layout(layout)
    };
    series_change = (container_id: string, frame_id: string, series_type: Series_Type) => {
        console.log(`Series Change: ${container_id},${frame_id},${series_type}`)
    };
    data_request = (container_id: string, frame_id: string, ticker: ticker, tf: string) => {
        console.log(`Data Request: ${container_id},${frame_id},${ticker},${tf}`)
    };
    symbol_search = (symbol: string, sources: string[], exchanges: string[], asset_classes: string[], confirmed: boolean) => {
        console.log(`Search Request: ${symbol},${sources},${exchanges},${asset_classes},${confirmed}`)
    };

    set_indicator_options = (container_id: string, frame_id: string, ind_id:string, obj: Object) => {
        console.log(`Set Indicator Options: ${container_id},${frame_id},${ind_id}`, obj)
    }
    indicator_request = (container_id: string, frame_id: string, pkg_key:string, ind_key: string) => {
        console.log(`Request Indicator: ${container_id},${frame_id},${pkg_key},${ind_key}`)
    }

    update_series_options = (container_id: string, frame_id: string, ind_id:string, ser_id:string, opts:any) => {
        console.log(`Set Series Options: ${container_id},${frame_id},${ind_id},${ser_id}`, opts)
    }
    
    /* ---------------- Python >>> Javascript ---------------- */
    // The following functions are called by Python. They are set by JS as the window is rendered

    setFrameless = (arg:boolean) => {}

    populate_search_tickers = (items:ticker[]) => {}
    set_search_filters = (category:string, opts:string[]) => {}

    populate_indicator_pkgs = (packages:{[key: string]: indicator_pkg}) => {}

    update_series_topbar_opts = (opts:any) => console.log('Series opts:', opts)
    update_layout_topbar_opts = (opts:any) => console.log('Layout opts:', opts)
    update_timeframe_topbar_opts = (opts:any) => console.log('Timeframe opts:', opts)

    set_user_colors = (opts:string[]) => {}

}