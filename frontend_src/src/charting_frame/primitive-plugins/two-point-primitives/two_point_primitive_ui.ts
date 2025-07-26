/**
 * Event Listener functions that are invoked by the toolbar and the toolbox that allow
 * the user to seamlessly create a TrendLine via Mouse input.
 */

import { ITimeScaleApi, MouseEventParams, Time } from "lightweight-charts"
import { PrimitiveBase, primitiveOptions } from "../primitive-base"
import { finalizeToolCreation } from "../tool_ui_support"
import { TwoPointPrimitive } from "./two_point_primitive"

let mouseMoveController = new AbortController()
export function cleanUpTwoPointTool(){ mouseMoveController.abort() }

export function configureTwoPointPrimitiveUI<T extends primitiveOptions>(e:MouseEvent, new_primitive: TwoPointPrimitive<T>): PrimitiveBase | null {
    //Set First point to where this click originated
    let p = new_primitive.series.coordinateToPrice(e.offsetY)
    let t = new_primitive.chart.timeScale().coordinateToTime(e.offsetX)
    
    if (t === null || p === null){
        new_primitive.remove()
        console.warn('Failed to create TrendLine, Price or Time invalid')
        return null
    }
    // Set both the points to the current value so it is displayed
    new_primitive.updateData({p1:{time:t, value:p}, p2:{time:t, value:p}})

    //Add Clean-up Logic for the remaining Event Listener
    mouseMoveController = new AbortController()

    //Setup Listeners to update the second TrendLine point
    const timescale = new_primitive.chart.timeScale()
    const bound_update_ref = updateSecondPoint.bind(new_primitive, timescale)
    new_primitive.chart.subscribeCrosshairMove(bound_update_ref)

    mouseMoveController.signal.addEventListener('abort', () => {
        new_primitive.chart.unsubscribeCrosshairMove(bound_update_ref)
    }, {once: true})

    // mount 'click' listener on 'click' event so the second point is only confirmed w/ a second click.
    document.addEventListener('click', () => {
        new_primitive.chart.chartElement().addEventListener(
            'click', confirmSecondPoint, {signal:mouseMoveController.signal}
        )
    }, {once: true})

    return new_primitive
}

function confirmSecondPoint(e:MouseEvent){
    if (e.button !== 0) return //Left mouseBtn listener

    cleanUpTwoPointTool()
    finalizeToolCreation()
    //All primitive tools need to call finalize once they are done.
}


function updateSecondPoint<T extends primitiveOptions>(
    this:TwoPointPrimitive<T>, timescale:ITimeScaleApi<Time>, param:MouseEventParams<Time>
){
    if (!param.point) return

    let t = timescale.coordinateToTime(param.point.x)
    let p = this.series.coordinateToPrice(param.point.y)
    if (t && p)
        this.updateData({p1:null, p2:{ time: t, value: p }})
}