/**
 * Event Listener functions that are invoked by the toolbar and the toolbox that allow
 * the user to seamlessly create a TrendLine via Mouse input.
 */

import { ITimeScaleApi, MouseEventParams, Time } from "lightweight-charts"
import { icons } from "../../../../tsx/generic_elements/icons"
import { charting_pane } from "../../charting_pane"
import { PrimitiveBase } from "../primitive-base"
import { finalizeToolCreation, PrimitiveTool } from "../tool_ui_support"
import { TrendLine } from "./trend-line"


export const TrendLineTool: PrimitiveTool = {
    icon: icons.trend_line,
    label: 'TrendLine',
    create: createTrendLine,
    cleanup: cleanUpTrendLineTool
}

let mouseMoveController = new AbortController()
function cleanUpTrendLineTool(){ mouseMoveController.abort() }

function createTrendLine(pane: charting_pane, e:MouseEvent): PrimitiveBase | null {
    const new_line = new TrendLine('', {p1:null, p2:null})
    pane._attachSeriesPrimitive(new_line)

    //Set First TrendLine point where this click originated
    let p = new_line.series.coordinateToPrice(e.offsetY)
    let t = new_line.chart.timeScale().coordinateToTime(e.offsetX)
    
    if (t === null || p === null){
        new_line.remove()
        console.warn('Failed to create TrendLine, Price or Time invalid')
        return null
    }
    // Set both the points to the current value so it is displayed
    new_line.updateData({p1:{time:t, value:p}, p2:{time:t, value:p}})

    //Add Clean-up Logic for the remaining Event Listener
    mouseMoveController = new AbortController()

    //Setup Listeners to update the second TrendLine point
    const timescale = new_line.chart.timeScale()
    const bound_update_ref = updateSecondPoint.bind(new_line, timescale)
    new_line.chart.subscribeCrosshairMove(bound_update_ref)

    mouseMoveController.signal.addEventListener('abort', () => {
        new_line.chart.unsubscribeCrosshairMove(bound_update_ref)
    }, {once: true})

    // mount 'click' listener on 'click' event so the second point is only confirmed w/ a second click.
    document.addEventListener('click', () => {
        new_line.chart.chartElement().addEventListener(
            'click', confirmSecondPoint, {signal:mouseMoveController.signal}
        )
    }, {once: true})

    return new_line
}

function confirmSecondPoint(e:MouseEvent){
    if (e.button !== 0) return //Left mouseBtn listener

    cleanUpTrendLineTool()
    finalizeToolCreation()
    //All primitive tools need to call finalize once they are done.
}


function updateSecondPoint(
    this:TrendLine, timescale:ITimeScaleApi<Time>, param:MouseEventParams<Time>
){
    if (!param.point) return

    let t = timescale.coordinateToTime(param.point.x)
    let p = this.series.coordinateToPrice(param.point.y)
    if (t && p)
        this.updateData({p1:null, p2:{ time: t, value: p }})
}