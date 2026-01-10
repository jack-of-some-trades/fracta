/**
 * The Topbar is located just above the charting window and holds controls for
 * changing the layout, timeframe, symbol, and series types
 */

import { JSX } from "solid-js"
import { IndicatorsBox } from "./indicators_menu"
import { LayoutSwitcher } from "./layout_switch"
import { SeriesSwitcher } from "./series_switch"
import { SymbolSearchBox } from "./symbol_search"
import { TimeframeSwitcher } from "./timeframe_switch"

export function TopBar(props: JSX.HTMLAttributes<HTMLDivElement>) {
    return <div class='layout_main layout_flex' {...props}>
        {/**** left Aligned ****/}
        <div class='topbar'>
            <SymbolSearchBox />
            <div class='topbar_separator' />
            <TimeframeSwitcher />
            <div class='topbar_separator' />
            <SeriesSwitcher />
            <div class='topbar_separator' />
            <IndicatorsBox />
            <div class='topbar_separator' />
        </div>

        {/**** Right Aligned ****/}
        <div class='topbar'>
            <div class='topbar_separator' />
            <LayoutSwitcher />
        </div>
    </div>
}
