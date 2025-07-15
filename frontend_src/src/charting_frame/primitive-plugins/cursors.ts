
/**
 * Currently these functions only set the cursor of the charting div since that is
 * accessible through css relatively easily. Ideally this functionality would be
 * expanded to loop through all of the charts created and show/hide the crosshairs
 * extensions that are drawn on the HTML5 Canvas by lightweight-charts.
 */

import { createSignal } from "solid-js"
import { icons } from "../../../tsx/generic_elements/icons"
import { SimpleTool } from "./tool_ui_support"

const tv_chart_css_rule = (() => {
    for (const sheet of Array.from(document.styleSheets))
        if (sheet.href !== null && sheet.href.endsWith('.css'))
            for (const rule of Array.from(sheet.cssRules))
                //@ts-ignore
                if (rule.selectorText === '.tv-lightweight-charts')
                    return rule
})()

const [selectedDot, setSelectedDot] = createSignal<boolean>(false)
const [selectedArrow, setSelectedArrow] = createSignal<boolean>(false)
const [selectedCross, setSelectedCross] = createSignal<boolean>(false)

export const CrosshairCursor: SimpleTool = {
    icon: icons.cursor_cross,
    label: 'Crosshair',
    execute: setCrosshair,
    selected: selectedCross,
}


export const ArrowCursor: SimpleTool = {
    icon: icons.cursor_arrow,
    label: 'Arrow',
    execute: setArrow,
    selected: selectedArrow,
}


export const DotCursor: SimpleTool = {
    icon: icons.cursor_dot,
    label: 'Dot',
    execute: setDot,
    selected: selectedDot,
}


function setCrosshair() {
    if (tv_chart_css_rule){
        (tv_chart_css_rule as CSSStyleRule).style.cursor = 'crosshair'
        setSelectedDot(false)
        setSelectedArrow(false)
        setSelectedCross(true)
    }
}

function setArrow() {
    if (tv_chart_css_rule){
        (tv_chart_css_rule as CSSStyleRule).style.cursor = ''
        setSelectedDot(false)
        setSelectedArrow(true)
        setSelectedCross(false)
    }
}

const cursor_dot = `url('data:image/svg+xml,<svg width="12px" height="12px" style="fill:white" viewBox="-4 -4 8.00 8.00" xmlns="http://www.w3.org/2000/svg"><path d="M -2.2 0 C -2.201.711 -0.37 2.769 1.097 1.922 C 1.777 1.529 2.197 0.803 2.197 0.017 C 2.197 -1.677 0.363 -2.735 -1.103 -1.888 C -1.784 -1.495 -2.203 -0.769 -2.203 0.017 Z"/></svg>') 6 6, auto`
function setDot() {
    if (tv_chart_css_rule){
        (tv_chart_css_rule as CSSStyleRule).style.cursor = cursor_dot
        setSelectedDot(true)
        setSelectedArrow(false)
        setSelectedCross(false)
    }
}
